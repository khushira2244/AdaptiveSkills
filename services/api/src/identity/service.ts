import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { identityRepository, onboardingRepository, repositories, withTransaction, type Database } from "@adaptive-labs/db";
import { HttpError } from "../http-error.js";

let activeDerivations = 0;
function derive(password: string, salt: string): Promise<Buffer> {
  if (activeDerivations >= 2) return Promise.reject(new HttpError(429,"AUTH_BUSY","Authentication is busy; try again shortly"));
  activeDerivations++;
  return new Promise((resolve,reject) => scrypt(password,salt,64,
    { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
    (error, result) => { activeDerivations--; error ? reject(error) : resolve(result); }));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derive(password,salt)).toString("hex");
}
async function verify(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = await derive(password,salt);
  const expected = Buffer.from(hash,"hex");
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export function identityService(pool: Database, secret: string) {
  const hashToken = (token: string) => createHmac("sha256",secret).update(token).digest("hex");
  // Unknown accounts still pay the password-verification cost.
  const dummyHash = randomBytes(16).toString("hex") + ":" + "00".repeat(64);
  const issue = async (db: Parameters<typeof identityRepository>[0], learnerId: string) => {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await identityRepository(db).createSession(learnerId, hashToken(token), expiresAt);
    return { token, expiresAt: expiresAt.toISOString(), learnerId };
  };
  return {
    async signup(email: string, password: string) {
      const passwordHash = await hashPassword(password);
      try {
        return await withTransaction(pool, async client => {
          const learner = await repositories(client).createLearner();
          await identityRepository(client).createAccount(learner.learnerId,email,passwordHash);
          await onboardingRepository(client).initialize(learner.learnerId);
          return issue(client, learner.learnerId);
        });
      } catch (error) {
        if (typeof error === "object" && error && "code" in error && error.code === "23505")
          throw new HttpError(409,"ACCOUNT_EXISTS","Unable to create account with these details");
        throw error;
      }
    },
    async login(email: string, password: string) {
      const account = await identityRepository(pool).account(email);
      const valid = await verify(password, account?.passwordHash ?? dummyHash);
      if (!valid || !account) throw new HttpError(401,"UNAUTHORIZED","Invalid email or password");
      return issue(pool, account.learnerId);
    },
    async authenticate(header: string | undefined) {
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header ?? "")?.[1];
      if (!token) throw new HttpError(401,"UNAUTHORIZED","Authentication required");
      const session = await identityRepository(pool).session(hashToken(token));
      if (!session) throw new HttpError(401,"UNAUTHORIZED","Authentication required");
      return { learnerId: session.learnerId, tokenHash: hashToken(token) };
    },
    async logout(tokenHash: string) { await identityRepository(pool).revoke(tokenHash); },
  };
}
