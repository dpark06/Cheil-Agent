import crypto from "crypto";
import { db } from "@/lib/db";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a password reset token for a user, invalidating any previous
 * unused tokens first. Returns the raw token — only its SHA-256 hash is
 * stored, so the raw value must go directly into the emailed reset link
 * and is never recoverable from the database afterward.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("hex");

  await db.$transaction([
    // Invalidate any still-live tokens for this user rather than letting
    // multiple valid reset links pile up.
    db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    }),
  ]);

  return rawToken;
}

/**
 * Validates a raw reset token from a reset-password link. On success, marks
 * the token used (single-use) and returns the associated userId; the caller
 * is responsible for actually updating the password.
 */
export async function consumePasswordResetToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }

  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return record.userId;
}
