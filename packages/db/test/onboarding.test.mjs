import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { createDatabase, migrate, repositories } from "../dist/index.js";
import { createApp } from "../../../services/api/dist/src/app.js";
import { loadConfig, requireDatabaseUrl } from "../../../services/api/dist/src/config.js";
import { onboardingStateSchema } from "@adaptive-labs/contracts";
import { textPdf, textDocx } from "./document-fixtures.mjs";

const resumeReasoning={provider:"TEST",model:"resume-test",
  async extractResumeSkills({text}){return ["Python","Postgres","Custom unmapped skill"].filter(skill=>text.toLowerCase().includes(skill.toLowerCase().replace("postgres","postgresql")));},
  async propose(){throw new Error("Not used in onboarding tests");},
  async generateUnits(){throw new Error("Not used in onboarding tests");},
};

test("Layer 1 authenticated resumable onboarding", { timeout: 120000 }, async t => {
  const admin=createDatabase(requireDatabaseUrl(loadConfig()));
  const schema="layer1_"+randomUUID().replaceAll("-","");
  await admin.query('CREATE SCHEMA "'+schema+'"');
  const url=new URL(requireDatabaseUrl(loadConfig()));
  url.searchParams.set("options","-c search_path="+schema+",public");
  const pool=createDatabase(url.toString());
  await migrate(pool);
  const storage=await mkdtemp(join(tmpdir(),"adaptive-resume-"));
  const config=loadConfig({
    DATABASE_URL:url.toString(), AUTH_SECRET:randomBytes(32).toString("hex"),
    RESUME_STORAGE_DIR:storage, LOG_LEVEL:"silent",
  });
  let app=createApp(config,{learningReasoning:resumeReasoning});
  await app.ready();
  t.after(async()=>{
    await app.close();
    await pool.end();
    await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
    await admin.end();
    assert.equal(dirname(resolve(storage)),resolve(tmpdir()));
    await rm(storage,{ recursive:true,force:true });
  });
  const password=randomBytes(20).toString("hex");
  let a,b,state;
  let requestNumber=0;
  async function call(method,url,payload,token=a?.token,expected=200) {
    const response=await app.inject({
      method,url,...(payload === undefined ? {} : { payload }),
      headers:token ? { authorization:"Bearer "+token } : {},
      remoteAddress:"127.0.1."+((requestNumber++ % 200)+1),
    });
    assert.equal(response.statusCode,expected,response.body);
    return response.statusCode===204 ? null : response.json();
  }
  async function save(method,path,data,expected=200) {
    const result=await call(method,path,{ version:state.version,...data },a.token,expected);
    if (expected===200) state=onboardingStateSchema.parse(result);
    return result;
  }
  async function advance(step) { await save("POST","/me/onboarding/advance",{ step }); }

  await t.test("signup creates stable identities and persists only credential hashes",async()=>{
    a=await call("POST","/auth/signup",{ email:"FIRST@example.com",password },null,201);
    b=await call("POST","/auth/signup",{ email:"second@example.com",password },null,201);
    assert.notEqual(a.learnerId,b.learnerId);
    const account=(await pool.query("SELECT email,password_hash FROM learner_accounts WHERE learner_id=$1",[a.learnerId])).rows[0];
    assert.equal(account.email,"first@example.com");
    assert.notEqual(account.password_hash,password);
    const sessions=(await pool.query("SELECT token_hash FROM learner_sessions")).rows;
    assert.ok(sessions.every(s=>s.token_hash!==a.token && s.token_hash!==b.token));
    state=onboardingStateSchema.parse(await call("GET","/me/onboarding"));
    assert.equal(state.currentStep,"profile");
    assert.equal(state.completed,false);
  });
  await t.test("login normalizes email; unknown/wrong credentials and invalid sessions fail safely",async()=>{
    const session=await call("POST","/auth/login",{ email:"FIRST@EXAMPLE.COM",password },null);
    assert.equal(session.learnerId,a.learnerId);
    const wrong=await call("POST","/auth/login",{ email:"first@example.com",password:"wrong-password-long" },null,401);
    const unknown=await call("POST","/auth/login",{ email:"absent@example.com",password:"wrong-password-long" },null,401);
    assert.equal(wrong.error.message,unknown.error.message);
    await call("GET","/me",undefined,null,401);
    await call("GET","/me",undefined,randomBytes(32).toString("base64url"),401);
    await call("POST","/auth/signup",{ email:"first@example.com",password },null,409);
  });
  await t.test("identity cannot be overridden through query, header or body",async()=>{
    const me=await call("GET","/me?learnerId="+b.learnerId);
    assert.equal(me.learner.learnerId,a.learnerId);
    await call("PATCH","/me/profile",{ version:0, learnerId:b.learnerId,profile:{ displayName:"Hijack" } },a.token,400);
    assert.equal((await call("GET","/me/onboarding",undefined,b.token)).profile.displayName,null);
  });
  await t.test("required step gates and invalid input do not mutate saved state",async()=>{
    await save("POST","/me/onboarding/advance",{ step:"profile" },422);
    await save("POST","/me/onboarding/complete",{},422);
    await save("PATCH","/me/profile",{ profile:{ experienceYears:-1 } },400);
    assert.equal((await call("GET","/me/onboarding")).version,0);
  });
  await t.test("profile, role, zero years experience and explicit step progress persist",async()=>{
    await save("PATCH","/me/profile",{ profile:{ displayName:"First learner" } });
    assert.equal(state.currentStep,"profile");
    await advance("profile");
    await save("PATCH","/me/profile",{ profile:{ currentRole:"Backend Engineer" } });
    await advance("role");
    await save("PATCH","/me/profile",{ profile:{ experienceYears:0 } });
    await advance("experience");
    assert.equal(state.currentStep,"resume");
  });
  await t.test("CV intake stores a reference, never silently applies suggestions",async()=>{
    await save("POST","/me/resume",{
      filename:"resume.txt",mimeType:"text/plain",contentBase64:Buffer.from("Python and PostgreSQL experience").toString("base64"),
    });
    assert.deepEqual(state.resume.suggestions,["Python","PostgreSQL"]);
    assert.equal(state.resume.confirmed,false);
    assert.deepEqual(state.skills,[]);
    assert.equal(state.profile.currentRole,"Backend Engineer");
    assert.equal((await readdir(storage)).length,1);
    const before=await call("GET","/me/onboarding",undefined,b.token);
    await call("POST","/me/resume/confirm",{
      version:before.version,resumeId:state.resume.resumeId,skillNames:["Python"],
    },b.token,404);
    await save("POST","/me/resume/confirm",{ resumeId:state.resume.resumeId,skillNames:["Invented"] },422);
    await save("POST","/me/resume/confirm",{ resumeId:state.resume.resumeId,skillNames:["Python"] });
    assert.equal(state.skills[0].name,"Python");
    assert.equal(state.skills[0].source,"CV_CONFIRMED");
    assert.equal(state.skills[0].level,null);
    assert.equal(state.resume.confirmed,true);
    await advance("resume");
  });
  await t.test("PDF and DOCX extract suggestions; invalid uploads preserve prior state",async()=>{
    for (const [filename,mimeType,bytes] of [
      ["resume.pdf","application/pdf",textPdf()],
      ["resume.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",textDocx()],
    ]) {
      const skills=structuredClone(state.skills);
      await save("POST","/me/resume",{ filename,mimeType,contentBase64:bytes.toString("base64") });
      assert.ok(state.resume.suggestions.includes("Python"));
      assert.deepEqual(state.skills,skills);
      assert.equal((await readdir(storage)).length,1);
    }
    const before=structuredClone(state);
    await save("POST","/me/resume",{ filename:"bad.pdf",mimeType:"application/pdf",contentBase64:Buffer.from("not a pdf").toString("base64") },422);
    await save("POST","/me/resume",{ filename:"../escape.txt",mimeType:"text/plain",contentBase64:Buffer.from("Python").toString("base64") },400);
    assert.deepEqual(await call("GET","/me/onboarding"),before);
  });
  await t.test("rated and unrated skills resume exactly and can advance without classification",async()=>{
    await save("PUT","/me/skills",{ skills:[
      { name:"Python",source:"CV_CONFIRMED",level:"AWARE",subskills:[] },
      { name:"Custom distributed cache tuning",source:"MANUAL",level:null,subskills:[{ name:"Eviction",level:null }] },
    ] });
    const before=structuredClone(state);
    await app.close();
    app=createApp(config,{learningReasoning:resumeReasoning});
    await app.ready();
    state=onboardingStateSchema.parse(await call("GET","/me/onboarding"));
    assert.deepEqual(state,before);
    assert.equal(state.currentStep,"skills");
    assert.deepEqual(state.skills.map(({ name,source,level })=>({ name,source,level })),[
      { name:"Python",source:"CV_CONFIRMED",level:"AWARE" },
      { name:"Custom distributed cache tuning",source:"MANUAL",level:null },
    ]);
    const session=await call("POST","/auth/login",{ email:"first@example.com",password },null);
    a={ ...a,...session };
    assert.deepEqual(await call("GET","/me/onboarding"),before);
    await advance("skills");
    assert.equal(state.currentStep,"goal");
  });
  await t.test("stale and concurrent autosaves cannot overwrite newer data",async()=>{
    const version=state.version;
    const payload={ version,skills:[{ name:"Custom cache tuning",level:"WORKING",subskills:[] }] };
    const responses=await Promise.all([1,2].map(()=>app.inject({
      method:"PUT",url:"/me/skills",headers:{ authorization:"Bearer "+a.token },payload,
    })));
    assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);
    state=onboardingStateSchema.parse(await call("GET","/me/onboarding"));
    await call("PUT","/me/skills",payload,a.token,409);
    assert.equal(state.version,version+1);
    await save("PUT","/me/skills",{ skills:[{ name:"SQL",level:"WORKING",subskills:[] },{ name:"sql",level:null,subskills:[] }] },400);
  });
  await t.test("free-text goal, interests, pace and timeline round-trip",async()=>{
    await save("PUT","/me/goal",{ goal:{ target:"Build reliable AI applications for healthcare",reason:"Career transition" } });
    await advance("goal");
    await save("PUT","/me/interests",{ interests:["Healthcare","Developer tools"] });
    await advance("interests");
    await save("PUT","/me/preferences",{ preferences:{ timelineDays:90,pace:"STEADY" } });
    await advance("preferences");
    assert.equal(state.currentStep,"review");
    assert.equal((await pool.query("SELECT count(*)::int n FROM learner_goals")).rows[0].n,0);
    assert.equal((await pool.query("SELECT count(*)::int n FROM target_profiles")).rows[0].n,0);
  });
  await t.test("completion is persisted, idempotent, and routes to unpaid Home",async()=>{
    await save("POST","/me/onboarding/complete",{});
    assert.equal(state.completed,true);
    assert.equal(state.currentStep,"complete");
    assert.equal(state.nextRoute,"UNPAID_HOME");
    const completed=structuredClone(state);
    assert.deepEqual(await call("POST","/me/onboarding/complete",{ version:0 }),completed);
    await app.close(); app=createApp(config); await app.ready();
    assert.deepEqual(await call("GET","/me/onboarding"),completed);
    assert.equal((await call("GET","/me")).productState,"UNPAID_HOME");
    await save("PUT","/me/interests",{ interests:["Changed"] },409);
  });
  await t.test("second learner sees only their state and can skip optional CV/skills/interests",async()=>{
    let s=await call("GET","/me/onboarding",undefined,b.token);
    assert.equal(s.profile.displayName,null); assert.deepEqual(s.skills,[]); assert.equal(s.resume,null);
    s=await call("PATCH","/me/profile",{ version:s.version,profile:{ displayName:"Beginner",currentRole:"Student",experienceYears:0 } },b.token);
    for (const step of ["profile","role","experience","resume","skills"]) {
      s=await call("POST","/me/onboarding/advance",{ version:s.version,step },b.token);
    }
    s=await call("PUT","/me/goal",{ version:s.version,goal:{ target:"Learn practical English",reason:null } },b.token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"goal" },b.token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"interests" },b.token);
    s=await call("PUT","/me/preferences",{ version:s.version,preferences:{ timelineDays:30,pace:"CASUAL" } },b.token);
    s=await call("POST","/me/onboarding/advance",{ version:s.version,step:"preferences" },b.token);
    s=await call("POST","/me/onboarding/complete",{ version:s.version },b.token);
    assert.equal(s.nextRoute,"UNPAID_HOME");
  });
  await t.test("logout revokes the current session and expiry is enforced",async()=>{
    await call("POST","/auth/logout",{},a.token,204);
    await call("GET","/me",undefined,a.token,401);
    assert.equal((await call("GET","/me",undefined,b.token)).learner.learnerId,b.learnerId);
    await pool.query("UPDATE learner_sessions SET expires_at=now()-interval '1 second' WHERE learner_id=$1",[b.learnerId]);
    await call("GET","/me",undefined,b.token,401);
  });
  await t.test("authentication endpoints enforce rate limiting",async()=>{
    const statuses=[];
    for (let i=0;i<11;i++) statuses.push((await app.inject({
      method:"POST",url:"/auth/login",payload:{ email:"invalid",password:"x" },remoteAddress:"192.0.2.1",
    })).statusCode);
    assert.equal(statuses.at(-1),429);
  });
});
