import type { Pool, PoolClient } from "pg";
import type { TrialStatus } from "@adaptive-labs/contracts";
type DB = Pool | PoolClient;
export type RevenueCatEvent = {
  id: string; type: string; appUserId: string; aliases: string[]; originalAppUserId: string | null;
  entitlementIds: string[]; productId: string | null; transactionId: string | null;
  originalTransactionId: string | null; store: string | null; environment: "SANDBOX" | "PRODUCTION" | null;
  currency: string | null; price: number | null; purchasedAtMs: number | null; eventTimestampMs: number;
};

export function commerceRepository(db: DB) {
  return {
    async ensureCustomer(learnerId: string) {
      const appUserId=`learner_${learnerId}`;
      const result=await db.query<{ appUserId: string }>(`INSERT INTO revenuecat_customers(learner_id,app_user_id)
        VALUES($1,$2) ON CONFLICT(learner_id) DO UPDATE SET updated_at=now()
        RETURNING app_user_id AS "appUserId"`,[learnerId,appUserId]);
      await db.query(`INSERT INTO learner_trial_states(learner_id) VALUES($1) ON CONFLICT DO NOTHING`,[learnerId]);
      return result.rows[0]!.appUserId;
    },
    async learnerForAppUserIds(ids: string[]) {
      if (!ids.length) return null;
      const result=await db.query<{ learnerId: string }>(`SELECT learner_id AS "learnerId" FROM revenuecat_customers
        WHERE app_user_id=ANY($1::text[])`,[ids]);
      const learners=[...new Set(result.rows.map(row=>row.learnerId))];
      return learners.length===1 ? learners[0]! : null;
    },
    async trial(learnerId: string) {
      const result=await db.query<{ status: TrialStatus; activatedAt: Date | null }>(`SELECT status,activated_at AS "activatedAt"
        FROM learner_trial_states WHERE learner_id=$1`,[learnerId]);
      return result.rows[0] ?? { status:"NOT_PURCHASED" as const,activatedAt:null };
    },
    async startAttempt(learnerId: string, platform: string, countryCode: string | null) {
      const result=await db.query<{ id: string }>(`INSERT INTO purchase_attempts(learner_id,product_key,status,platform,country_code)
        VALUES($1,'TRY_IT_WITH_LABS','PENDING',$2,$3)
        ON CONFLICT(learner_id) WHERE status='PENDING' DO UPDATE SET updated_at=now()
        RETURNING purchase_attempt_id AS id`,[learnerId,platform,countryCode]);
      await db.query(`UPDATE learner_trial_states SET status='PURCHASE_PENDING',activated_at=NULL,updated_at=now() WHERE learner_id=$1`,[learnerId]);
      return result.rows[0]!.id;
    },
    async finishAttempt(learnerId: string, id: string, outcome: "CANCELLED"|"FAILED", errorCode: string | null) {
      const result=await db.query(`UPDATE purchase_attempts SET status=$3,error_code=$4,updated_at=now()
        WHERE purchase_attempt_id=$2 AND learner_id=$1 AND status='PENDING'`,[learnerId,id,outcome,errorCode]);
      if (!result.rowCount) return false;
      await db.query(`UPDATE learner_trial_states SET status='NOT_PURCHASED',activated_at=NULL,updated_at=now()
        WHERE learner_id=$1 AND status='PURCHASE_PENDING'`,[learnerId]);
      return true;
    },
    async recordEvent(raw: unknown, event: RevenueCatEvent, status: "PROCESSED"|"IGNORED"|"UNMATCHED") {
      const result=await db.query(`INSERT INTO revenuecat_webhook_events
        (event_id,event_type,app_user_id,event_timestamp_ms,payload,processing_status)
        VALUES($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT DO NOTHING`,
        [event.id,event.type,event.appUserId,event.eventTimestampMs,JSON.stringify(raw),status]);
      return result.rowCount === 1;
    },
    async activate(learnerId: string, entitlementKey: string, event: RevenueCatEvent) {
      const current=await db.query<{ timestamp: string }>(`SELECT latest_event_timestamp_ms::text AS timestamp FROM learner_entitlements
        WHERE learner_id=$1 AND entitlement_key=$2 FOR UPDATE`,[learnerId,entitlementKey]);
      if (Number(current.rows[0]?.timestamp ?? -1) > event.eventTimestampMs) return;
      await db.query(`INSERT INTO learner_entitlements(learner_id,entitlement_key,status,product_id,store,environment,
        original_transaction_id,latest_transaction_id,purchased_at,latest_event_id,latest_event_timestamp_ms)
        VALUES($1,$2,'ACTIVE',$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(learner_id,entitlement_key) DO UPDATE SET status='ACTIVE',product_id=$3,store=$4,environment=$5,
        original_transaction_id=COALESCE(learner_entitlements.original_transaction_id,$6),latest_transaction_id=$7,
        purchased_at=COALESCE(learner_entitlements.purchased_at,$8),latest_event_id=$9,latest_event_timestamp_ms=$10,updated_at=now()`,
        [learnerId,entitlementKey,event.productId,event.store,event.environment,event.originalTransactionId,
          event.transactionId,event.purchasedAtMs ? new Date(event.purchasedAtMs) : null,event.id,event.eventTimestampMs]);
      await db.query(`UPDATE learner_trial_states SET status='ACTIVE_SETUP_PENDING',activated_at=COALESCE(activated_at,now()),updated_at=now()
        WHERE learner_id=$1`,[learnerId]);
      await db.query(`UPDATE purchase_attempts SET status='SUCCEEDED',updated_at=now()
        WHERE learner_id=$1 AND status='PENDING'`,[learnerId]);
      if (event.transactionId && event.productId) await db.query(`INSERT INTO billing_transactions
        (transaction_id,learner_id,product_key,product_id,store,environment,amount,currency_code,purchased_at,status)
        VALUES($1,$2,'TRY_IT_WITH_LABS',$3,$4,$5,$6,$7,$8,'SUCCEEDED')
        ON CONFLICT(transaction_id) DO UPDATE SET status='SUCCEEDED',updated_at=now()`,
        [event.transactionId,learnerId,event.productId,event.store,event.environment,event.price,event.currency,
          event.purchasedAtMs ? new Date(event.purchasedAtMs) : null]);
    },
    async revoke(learnerId: string, entitlementKey: string, event: RevenueCatEvent) {
      await db.query(`UPDATE learner_entitlements SET status='REVOKED',latest_event_id=$3,latest_event_timestamp_ms=$4,updated_at=now()
        WHERE learner_id=$1 AND entitlement_key=$2 AND latest_event_timestamp_ms <= $4`,[learnerId,entitlementKey,event.id,event.eventTimestampMs]);
      if (event.transactionId) await db.query(`UPDATE billing_transactions SET status='REVOKED',updated_at=now() WHERE transaction_id=$1`,[event.transactionId]);
      await db.query(`UPDATE learner_trial_states SET status='NOT_PURCHASED',activated_at=NULL,updated_at=now() WHERE learner_id=$1`,[learnerId]);
    },
    async billing(learnerId: string) {
      const result=await db.query(`SELECT transaction_id AS "transactionId",product_key AS "productKey",product_id AS "productId",
        amount::float,currency_code AS "currencyCode",store,status,purchased_at AS "purchasedAt"
        FROM billing_transactions WHERE learner_id=$1 ORDER BY purchased_at DESC NULLS LAST,created_at DESC LIMIT 1`,[learnerId]);
      return result.rows[0] ?? null;
    },
  };
}
