import { db } from "@/lib/db";

export class RateLimitExceededError extends Error {}

/**
 * DB-backed rate limiting (no Redis available in this deployment — see
 * docs/known-gaps.md). Counts AuditEvent rows rather than a dedicated
 * counter table, since every rate-limited action already writes one.
 */
export async function assertUnderRateLimit(
  userId: string,
  eventType: string,
  maxPerHour: number,
): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await db.auditEvent.count({
    where: { userId, eventType, createdAt: { gte: since } },
  });
  if (count >= maxPerHour) {
    throw new RateLimitExceededError(
      `Rate limit exceeded: max ${maxPerHour} "${eventType}" actions per hour.`,
    );
  }
}

/**
 * Same as assertUnderRateLimit but keyed by an arbitrary string (an email
 * address, typically) instead of a userId — for actions like "forgot
 * password" that happen before the requester is authenticated, where the
 * account may not even exist.
 */
export async function assertUnderKeyedRateLimit(
  key: string,
  eventType: string,
  maxPerHour: number,
): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const count = await db.auditEvent.count({
    where: {
      eventType,
      createdAt: { gte: since },
      payload: { path: ["rateLimitKey"], equals: key },
    },
  });
  if (count >= maxPerHour) {
    throw new RateLimitExceededError(
      `Rate limit exceeded: max ${maxPerHour} "${eventType}" actions per hour.`,
    );
  }
}
