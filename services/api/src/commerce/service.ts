import { z } from "zod";
import { commerceRepository, onboardingRepository, withTransaction, type Database, type RevenueCatEvent } from "@adaptive-labs/db";
import { billingStateSchema, homeStateSchema, purchaseIntentResponseSchema } from "@adaptive-labs/contracts";
import { HttpError } from "../http-error.js";

const webhookSchema=z.object({
  api_version:z.string(),
  event:z.object({
    id:z.string().min(1),type:z.string().min(1),app_user_id:z.string().min(1),
    aliases:z.array(z.string()).optional().default([]),original_app_user_id:z.string().nullable().optional(),
    entitlement_ids:z.array(z.string()).nullable().optional(),entitlement_id:z.string().nullable().optional(),
    product_id:z.string().nullable().optional(),transaction_id:z.string().nullable().optional(),
    original_transaction_id:z.string().nullable().optional(),store:z.string().nullable().optional(),
    environment:z.enum(["SANDBOX","PRODUCTION"]).nullable().optional(),currency:z.string().nullable().optional(),
    price_in_purchased_currency:z.number().nullable().optional(),price:z.number().nullable().optional(),
    purchased_at_ms:z.number().int().nullable().optional(),event_timestamp_ms:z.number().int(),
  }).passthrough(),
}).passthrough();

function normalized(payload: unknown): { raw: unknown; event: RevenueCatEvent } {
  const parsed=webhookSchema.safeParse(payload);
  if (!parsed.success) throw new HttpError(400,"INVALID_WEBHOOK","Invalid RevenueCat webhook payload");
  const e=parsed.data.event;
  return { raw:payload,event:{
    id:e.id,type:e.type,appUserId:e.app_user_id,aliases:e.aliases,originalAppUserId:e.original_app_user_id ?? null,
    entitlementIds:e.entitlement_ids ?? (e.entitlement_id ? [e.entitlement_id] : []),productId:e.product_id ?? null,
    transactionId:e.transaction_id ?? null,originalTransactionId:e.original_transaction_id ?? null,
    store:e.store ?? null,environment:e.environment ?? null,currency:e.currency ?? null,
    price:e.price_in_purchased_currency ?? e.price ?? null,purchasedAtMs:e.purchased_at_ms ?? null,
    eventTimestampMs:e.event_timestamp_ms,
  }};
}

export class HomeStateService {
  constructor(private pool: Database,private entitlementKey: string,private offeringId: string) {}
  async read(learnerId: string) {
    return withTransaction(this.pool,async client=>{
      const onboarding=onboardingRepository(client), commerce=commerceRepository(client);
      const state=await onboarding.snapshot(learnerId);
      if (!state.completed) throw new HttpError(409,"ONBOARDING_INCOMPLETE","Complete onboarding before opening Home");
      const appUserId=await commerce.ensureCustomer(learnerId),trial=await commerce.trial(learnerId);
      const active=["ACTIVE_SETUP_PENDING","ACTIVE","COMPLETED"].includes(trial.status);
      const pending=trial.status === "PURCHASE_PENDING";
      const runway=active?await client.query<any>(`SELECT runway_id,status FROM learning_runways WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 1`,[learnerId]):{rows:[]};
      let learningState:null|string=null,learningAction:null|string=null;
      if(runway.rows[0]){const r=runway.rows[0];const lab=await client.query<any>(`SELECT status FROM labs WHERE runway_id=$1 AND status IN ('READY','IN_PROGRESS') ORDER BY created_at LIMIT 1`,[r.runway_id]);const unit=await client.query<any>(`SELECT status FROM learning_runway_units WHERE runway_id=$1 AND status<>'COMPLETE' ORDER BY position LIMIT 1`,[r.runway_id]);const blockers=await client.query(`SELECT 1 FROM learner_doubts WHERE learner_id=$1 AND status IN ('OPEN','PLANNED') AND resolution_type='RESOLVE_BEFORE_LAB' LIMIT 1`,[learnerId]);if(r.status==="CURRENT_RUNWAY_COMPLETE"){learningState="CURRENT_RUNWAY_COMPLETE";learningAction="REVIEW_NEXT_RUNWAY";}else if(r.status==="NEXT_RUNWAY_AWAITING_PURCHASE"){learningState="NEXT_RUNWAY_AWAITING_PURCHASE";learningAction="VIEW_NEXT_RUNWAY";}else if(r.status==="NEXT_RUNWAY_PURCHASED"){learningState="NEXT_RUNWAY_PURCHASED_GENERATING";learningAction="WAIT_REFRESH";}else if(r.status==="NEXT_RUNWAY_READY"){learningState="NEXT_RUNWAY_READY";learningAction="CONTINUE_LEARNING";}else if(lab.rows[0]?.status==="IN_PROGRESS"){learningState="LAB_IN_PROGRESS";learningAction="RESUME_LAB";}else if(blockers.rowCount&&unit.rows[0]?.status==="DOUBT_CHECKPOINT"){learningState="DOUBT_CLEARANCE_REQUIRED";learningAction="DOUBT_CLEARANCE";}else if(lab.rows[0]?.status==="READY"){learningState="LAB_READY";learningAction="START_LAB";}else{learningState="NEXT_UNIT_READY";learningAction="CONTINUE_LEARNING";}}
      return homeStateSchema.parse({
        state:active ? "TRIAL_PAID_SETUP_PENDING" : pending ? "PURCHASE_IN_PROGRESS" : "PROFILE_COMPLETE_UNPAID",
        learner:{ name:state.profile.displayName ?? "Learner",goal:state.goal?.target ?? "",
          timelineDays:state.preferences.timelineDays,strengthSummary:state.skills[0]?.name ?? null,interests:state.interests },
        revenueCat:{ appUserId,entitlementKey:this.entitlementKey,offeringId:this.offeringId },
        offer:active ? null : { productKey:"TRY_IT_WITH_LABS",localizedPrice:null,currencyCode:null,
          available:null,pricingSource:"REVENUECAT_SDK" },
        trial:{ status:trial.status,activatedAt:trial.activatedAt?.toISOString() ?? null },
        learningState,
        primaryAction:{ type:learningAction??(active ? "CONTINUE_TRIAL_SETUP" : pending ? "WAIT_FOR_PURCHASE" : "START_TRIAL_PURCHASE") },
      });
    });
  }
}

export class PurchaseStateService {
  constructor(private pool: Database,private entitlementKey: string) {}
  async start(learnerId: string,platform: "ios"|"android",countryCode: string|null) {
    return withTransaction(this.pool,async client=>{
      const onboarding=await onboardingRepository(client).snapshot(learnerId);
      if (!onboarding.completed) throw new HttpError(409,"ONBOARDING_INCOMPLETE","Complete onboarding before purchasing");
      const repo=commerceRepository(client),appUserId=await repo.ensureCustomer(learnerId),trial=await repo.trial(learnerId);
      if (["ACTIVE_SETUP_PENDING","ACTIVE","COMPLETED"].includes(trial.status)) return purchaseIntentResponseSchema.parse({
        purchaseAttemptId:null,revenueCatAppUserId:appUserId,
        productKey:"TRY_IT_WITH_LABS",entitlementKey:this.entitlementKey,status:"ALREADY_ACTIVE",
      });
      const id=await repo.startAttempt(learnerId,platform,countryCode);
      return purchaseIntentResponseSchema.parse({ purchaseAttemptId:id,revenueCatAppUserId:appUserId,
        productKey:"TRY_IT_WITH_LABS",entitlementKey:this.entitlementKey,status:"PENDING" });
    });
  }
  async outcome(learnerId: string,id: string,outcome: "CANCELLED"|"FAILED",errorCode: string|null) {
    const changed=await withTransaction(this.pool,client=>commerceRepository(client).finishAttempt(learnerId,id,outcome,errorCode));
    if (!changed) throw new HttpError(404,"PURCHASE_ATTEMPT_NOT_FOUND","Pending purchase attempt not found");
    return { status:outcome };
  }
}

export class RevenueCatWebhookService {
  constructor(private pool: Database,private entitlementKey: string,private continuationEntitlementKey?:string,private continuationProductId?:string) {}
  async process(payload: unknown) {
    const { raw,event }=normalized(payload);
    return withTransaction(this.pool,async client=>{
      const repo=commerceRepository(client);
      const ids=[event.appUserId,event.originalAppUserId,...event.aliases].filter((v):v is string=>Boolean(v));
      const learnerId=await repo.learnerForAppUserIds(ids);
      const hasEntitlement=event.entitlementIds.includes(this.entitlementKey);
      const hasContinuation=Boolean(this.continuationEntitlementKey&&event.entitlementIds.includes(this.continuationEntitlementKey));
      const activating=["INITIAL_PURCHASE","NON_RENEWING_PURCHASE","PURCHASE_REDEEMED","TEMPORARY_ENTITLEMENT_GRANT"].includes(event.type) && hasEntitlement;
      const revoking=["CANCELLATION","EXPIRATION"].includes(event.type) && hasEntitlement;
      const continuationActivating=["INITIAL_PURCHASE","NON_RENEWING_PURCHASE","PURCHASE_REDEEMED","TEMPORARY_ENTITLEMENT_GRANT"].includes(event.type)&&hasContinuation;
      const continuationRevoking=["CANCELLATION","EXPIRATION"].includes(event.type)&&hasContinuation;
      const status=!learnerId ? "UNMATCHED" : activating || revoking || continuationActivating || continuationRevoking ? "PROCESSED" : "IGNORED";
      const inserted=await repo.recordEvent(raw,event,status);
      if (!inserted) return { received:true,duplicate:true };
      if (learnerId && activating) await repo.activate(learnerId,this.entitlementKey,event);
      if (learnerId && revoking) await repo.revoke(learnerId,this.entitlementKey,event);
      if(learnerId&&continuationActivating)await client.query(`INSERT INTO learner_entitlements(learner_id,entitlement_key,status,product_id,store,environment,original_transaction_id,latest_transaction_id,purchased_at,latest_event_id,latest_event_timestamp_ms) VALUES($1,$2,'ACTIVE',$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(learner_id,entitlement_key) DO UPDATE SET status='ACTIVE',product_id=$3,store=$4,environment=$5,latest_transaction_id=$7,purchased_at=COALESCE(learner_entitlements.purchased_at,$8),latest_event_id=$9,latest_event_timestamp_ms=$10,updated_at=now()`,[learnerId,this.continuationEntitlementKey,event.productId??this.continuationProductId,event.store,event.environment,event.originalTransactionId,event.transactionId,event.purchasedAtMs?new Date(event.purchasedAtMs):null,event.id,event.eventTimestampMs]);
      if(learnerId&&continuationRevoking)await client.query(`UPDATE learner_entitlements SET status='REVOKED',latest_event_id=$3,latest_event_timestamp_ms=$4,updated_at=now() WHERE learner_id=$1 AND entitlement_key=$2 AND latest_event_timestamp_ms<=$4`,[learnerId,this.continuationEntitlementKey,event.id,event.eventTimestampMs]);
      return { received:true,duplicate:false };
    });
  }
}

export class BillingHistoryService {
  constructor(private pool: Database) {}
  async read(learnerId: string) {
    return withTransaction(this.pool,async client=>{
      const repo=commerceRepository(client); await repo.ensureCustomer(learnerId);
      const [trial,purchase]=await Promise.all([repo.trial(learnerId),repo.billing(learnerId)]);
      return billingStateSchema.parse({ trialStatus:trial.status,purchase:purchase ? {
        ...purchase,amount:purchase.amount ?? null,currencyCode:purchase.currencyCode ?? null,store:purchase.store ?? null,
        purchasedAt:purchase.purchasedAt instanceof Date ? purchase.purchasedAt.toISOString() : purchase.purchasedAt ?? null,
      }:null,message:"This is a one-time purchase, not a recurring subscription." });
    });
  }
}

export class RevenueCatCustomerService {
  constructor(private pool: Database,private entitlementKey: string,private secretApiKey?: string,private projectId?: string) {}
  async reconcile(learnerId: string) { return this.reconcileEntitlement(learnerId,this.entitlementKey,null,true); }
  async reconcileEntitlement(learnerId:string,entitlementKey:string,expectedProductId:string|null,activateTrial=false) {
    if (!this.secretApiKey) throw new HttpError(503,"REVENUECAT_NOT_CONFIGURED","RevenueCat reconciliation is not configured");
    const appUserId=await withTransaction(this.pool,client=>commerceRepository(client).ensureCustomer(learnerId));
    let active=false,productId:string|null=null,purchasedAtMs:number|null=null;
    if (this.projectId) {
      const entitlements=await this.getV2<{ items?: { id:string;lookup_key:string }[] }>(
        `/projects/${encodeURIComponent(this.projectId)}/entitlements?limit=100`);
      const configured=entitlements.items?.find(item=>item.lookup_key===entitlementKey);
      if (!configured) throw new HttpError(503,"REVENUECAT_CONFIGURATION_ERROR","Configured entitlement was not found in RevenueCat");
      const activeEntitlements=await this.getV2<{ items?: { entitlement_id:string;expires_at:number|null }[] }>(
        `/projects/${encodeURIComponent(this.projectId)}/customers/${encodeURIComponent(appUserId)}/active_entitlements?limit=100`);
      const entitlement=activeEntitlements.items?.find(item=>item.entitlement_id===configured.id);
      active=Boolean(entitlement) && (!entitlement?.expires_at || entitlement.expires_at>Date.now());
    } else {
      const customer=await this.getV1<{ subscriber?: { entitlements?: Record<string,{
        product_identifier?:string;purchase_date?:string;expires_date?:string|null }> } }>(`/subscribers/${encodeURIComponent(appUserId)}`);
      const entitlement=customer.subscriber?.entitlements?.[entitlementKey];
      active=Boolean(entitlement) && (!entitlement?.expires_date || Date.parse(entitlement.expires_date)>Date.now());
      productId=entitlement?.product_identifier ?? null;
      purchasedAtMs=entitlement?.purchase_date ? Date.parse(entitlement.purchase_date) : null;
    }
    const event:RevenueCatEvent={ id:`reconcile-${randomId()}`,type:active?"RECONCILED_ACTIVE":"RECONCILED_INACTIVE",
      appUserId,aliases:[],originalAppUserId:null,entitlementIds:[entitlementKey],
      productId:productId??(active?expectedProductId:null),transactionId:null,originalTransactionId:null,store:null,environment:null,
      currency:null,price:null,purchasedAtMs,eventTimestampMs:Date.now() };
    await withTransaction(this.pool,async client=>{
      const repo=commerceRepository(client);
      if(active&&activateTrial)await repo.activate(learnerId,entitlementKey,event);
      else if(active)await client.query(`INSERT INTO learner_entitlements(learner_id,entitlement_key,status,product_id,purchased_at,latest_event_id,latest_event_timestamp_ms) VALUES($1,$2,'ACTIVE',$3,now(),$4,$5) ON CONFLICT(learner_id,entitlement_key) DO UPDATE SET status='ACTIVE',product_id=$3,latest_event_id=$4,latest_event_timestamp_ms=$5,updated_at=now()`,[learnerId,entitlementKey,event.productId,event.id,event.eventTimestampMs]);
      else if(activateTrial)await repo.revoke(learnerId,entitlementKey,event);
      else await client.query(`UPDATE learner_entitlements SET status='REVOKED',latest_event_id=$3,latest_event_timestamp_ms=$4,updated_at=now() WHERE learner_id=$1 AND entitlement_key=$2`,[learnerId,entitlementKey,event.id,event.eventTimestampMs]);
    });
    return { reconciled:true,active };
  }
  private getV1<T>(path:string) { return this.get<T>(`https://api.revenuecat.com/v1${path}`); }
  private getV2<T>(path:string) { return this.get<T>(`https://api.revenuecat.com/v2${path}`); }
  private async get<T>(url: string): Promise<T> {
    let response:Response;
    try { response=await fetch(url,{
      headers:{ Authorization:`Bearer ${this.secretApiKey!}`,Accept:"application/json" },signal:AbortSignal.timeout(8000),
    }); } catch { throw new HttpError(503,"REVENUECAT_UNAVAILABLE","Could not refresh purchase status"); }
    if (!response.ok) throw new HttpError(503,"REVENUECAT_UNAVAILABLE","Could not refresh purchase status");
    return response.json() as Promise<T>;
  }
}

function randomId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
