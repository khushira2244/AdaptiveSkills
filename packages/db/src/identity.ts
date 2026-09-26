import type { Pool, PoolClient } from "pg";
type DB = Pool | PoolClient;
export function identityRepository(db: DB) {
  return {
    async account(email: string) {
      return (await db.query<{ learnerId: string; passwordHash: string }>(
        'SELECT learner_id AS "learnerId",password_hash AS "passwordHash" FROM learner_accounts WHERE email=$1', [email])).rows[0];
    },
    async createAccount(learnerId: string, email: string, hash: string) {
      await db.query("INSERT INTO learner_accounts(learner_id,email,password_hash) VALUES($1,$2,$3)", [learnerId,email,hash]);
    },
    async createSession(learnerId: string, hash: string, expiresAt: Date) {
      await db.query("INSERT INTO learner_sessions(learner_id,token_hash,expires_at) VALUES($1,$2,$3)", [learnerId,hash,expiresAt]);
    },
    async session(hash: string) {
      return (await db.query<{ learnerId: string }>(
        'SELECT learner_id AS "learnerId" FROM learner_sessions WHERE token_hash=$1 AND expires_at>now()', [hash])).rows[0];
    },
    async revoke(hash: string) {
      await db.query("DELETE FROM learner_sessions WHERE token_hash=$1", [hash]);
    },
  };
}
