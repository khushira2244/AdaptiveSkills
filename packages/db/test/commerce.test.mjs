import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes,randomUUID } from "node:crypto";
import { createDatabase,migrate } from "../dist/index.js";
import { createApp } from "../../../services/api/dist/src/app.js";
import { loadConfig,requireDatabaseUrl } from "../../../services/api/dist/src/config.js";
import { homeStateSchema,billingStateSchema } from "@adaptive-labs/contracts";

test("Layer 2 commerce, Home and verified entitlement boundary",{ timeout:120000 },async t=>{
  const admin=createDatabase(requireDatabaseUrl(loadConfig()));
  const schema="layer2_"+randomUUID().replaceAll("-","");
  await admin.query('CREATE SCHEMA "'+schema+'"');
  const url=new URL(requireDatabaseUrl(loadConfig())); url.searchParams.set("options","-c search_path="+schema+",public");
  const pool=createDatabase(url.toString()); await migrate(pool);
  const webhookToken="Bearer "+randomBytes(32).toString("hex");
  const config=loadConfig({ DATABASE_URL:url.toString(),AUTH_SECRET:randomBytes(32).toString("hex"),
    REVENUECAT_WEBHOOK_AUTH_TOKEN:webhookToken,REVENUECAT_ENTITLEMENT_ID:"adaptive_labs_pro",LOG_LEVEL:"silent" });
  let app=createApp(config); await app.ready();
  t.after(async()=>{ await app.close();await pool.end();await admin.query('DROP SCHEMA "'+schema+'" CASCADE');await admin.end(); });
  const password=randomBytes(20).toString("hex"); let requestNumber=1;
  async function call(method,path,payload,token,expected=200,headers={}) {
    const response=await app.inject({ method,url:path,...(payload===undefined?{}:{payload}),
      headers:{ ...(token?{ authorization:"Bearer "+token }:{}),...headers },remoteAddress:"198.51.100."+(requestNumber++%240+1) });
    assert.equal(response.statusCode,expected,response.body); return response.statusCode===204?null:response.json();
  }
  async function signup(email) { return call("POST","/auth/signup",{ email,password },null,201); }
  async function complete(token) {
    let s=await call("GET","/me/onboarding",undefined,token);
    s=await call("PATCH","/me/profile",{ version:s.version,profile:{ displayName:"Commerce learner",currentRole:"Backend Engineer",experienceYears:2 } },token);
    for (const step of ["profile","role","experience","resume","skills"]) s=await call("POST","/me/onboarding/advance",{ version:s.version,step },token);
    s=await call("PUT","/me/goal",{ version:s.version,goal:{ target:"Become a backend engineer",reason:null } },token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"goal" },token);
    s=await call("PUT","/me/interests",{ version:s.version,interests:["SaaS"] },token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"interests" },token);
    s=await call("PUT","/me/preferences",{ version:s.version,preferences:{ timelineDays:180,pace:"STEADY" } },token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"preferences" },token);
    await call("POST","/me/onboarding/complete",{ version:s.version },token);
  }
  const a=await signup("commerce-a@example.com"),b=await signup("commerce-b@example.com");
  await call("GET","/me/home",undefined,a.token,409);
  await complete(a.token); await complete(b.token);

  await t.test("unpaid Home is coherent and customer mapping is stable",async()=>{
    const first=homeStateSchema.parse(await call("GET","/me/home",undefined,a.token));
    const second=homeStateSchema.parse(await call("GET","/me/home",undefined,a.token));
    assert.equal(first.state,"PROFILE_COMPLETE_UNPAID"); assert.equal(first.offer.pricingSource,"REVENUECAT_SDK");
    assert.equal(first.offer.localizedPrice,null); assert.equal(first.revenueCat.appUserId,second.revenueCat.appUserId);
    assert.equal(first.revenueCat.entitlementKey,"adaptive_labs_pro");
    assert.equal((await pool.query("SELECT count(*)::int n FROM revenuecat_customers WHERE learner_id=$1",[a.learnerId])).rows[0].n,1);
  });
  let attempt;
  await t.test("cancelled and failed attempts never activate entitlement",async()=>{
    attempt=await call("POST","/me/purchases/intent",{ platform:"android",countryCode:"IN" },a.token);
    assert.equal(attempt.entitlementKey,"adaptive_labs_pro");
    assert.equal((await call("GET","/me/home",undefined,a.token)).state,"PURCHASE_IN_PROGRESS");
    await call("POST","/me/purchases/outcome",{ purchaseAttemptId:attempt.purchaseAttemptId,outcome:"CANCELLED" },a.token);
    assert.equal((await call("GET","/me/home",undefined,a.token)).state,"PROFILE_COMPLETE_UNPAID");
    attempt=await call("POST","/me/purchases/intent",{ platform:"android",countryCode:"US" },a.token);
    await call("POST","/me/purchases/outcome",{ purchaseAttemptId:attempt.purchaseAttemptId,outcome:"FAILED",errorCode:"STORE_ERROR" },a.token);
    assert.equal((await call("GET","/me/billing",undefined,a.token)).purchase,null);
    assert.equal((await pool.query("SELECT count(*)::int n FROM learner_entitlements WHERE learner_id=$1",[a.learnerId])).rows[0].n,0);
  });
  await t.test("webhook auth, activation and duplicate delivery are safe",async()=>{
    const home=await call("GET","/me/home",undefined,a.token);
    const payload={ api_version:"1.0",event:{ id:"evt-1",type:"NON_RENEWING_PURCHASE",app_user_id:home.revenueCat.appUserId,
      original_app_user_id:home.revenueCat.appUserId,aliases:[],entitlement_ids:["adaptive_labs_pro"],product_id:"try_it_inr_149",
      transaction_id:"txn-1",original_transaction_id:"txn-1",store:"PLAY_STORE",environment:"SANDBOX",currency:"INR",
      price_in_purchased_currency:149,purchased_at_ms:1760000000000,event_timestamp_ms:1760000001000 } };
    await call("POST","/webhooks/revenuecat",payload,null,401,{ authorization:"wrong" });
    assert.deepEqual(await call("POST","/webhooks/revenuecat",payload,null,200,{ authorization:webhookToken }),{ received:true,duplicate:false });
    assert.deepEqual(await call("POST","/webhooks/revenuecat",payload,null,200,{ authorization:webhookToken }),{ received:true,duplicate:true });
    assert.equal((await pool.query("SELECT count(*)::int n FROM revenuecat_webhook_events WHERE event_id='evt-1'")).rows[0].n,1);
  });
  await t.test("paid Home and billing persist without leaking to another learner",async()=>{
    const paid=homeStateSchema.parse(await call("GET","/me/home",undefined,a.token));
    assert.equal(paid.state,"TRIAL_PAID_SETUP_PENDING"); assert.equal(paid.offer,null);
    assert.equal(paid.primaryAction.type,"CONTINUE_TRIAL_SETUP");
    const billing=billingStateSchema.parse(await call("GET","/me/billing",undefined,a.token));
    assert.equal(billing.purchase.transactionId,"txn-1"); assert.equal(billing.purchase.currencyCode,"INR");
    assert.equal(billing.purchase.productId,"try_it_inr_149");
    const entitlement=(await pool.query("SELECT entitlement_key,product_id,status FROM learner_entitlements WHERE learner_id=$1",[a.learnerId])).rows[0];
    assert.deepEqual(entitlement,{ entitlement_key:"adaptive_labs_pro",product_id:"try_it_inr_149",status:"ACTIVE" });
    assert.equal((await call("GET","/me/home",undefined,b.token)).state,"PROFILE_COMPLETE_UNPAID");
    assert.equal((await call("GET","/me/billing",undefined,b.token)).purchase,null);
    const already=await call("POST","/me/purchases/intent",{ platform:"ios",countryCode:null },a.token);
    assert.equal(already.status,"ALREADY_ACTIVE");
    await app.close(); app=createApp(config); await app.ready();
    assert.equal((await call("GET","/me/home",undefined,a.token)).state,"TRIAL_PAID_SETUP_PENDING");
  });
});
