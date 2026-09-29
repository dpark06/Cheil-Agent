import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createPasswordResetToken } from "@/lib/security/password-reset";
import { assertUnderKeyedRateLimit, RateLimitExceededError } from "@/lib/security/rate-limit";
import { getEmailProvider } from "@/lib/email/provider-factory";
import { logAuditEvent } from "@/lib/audit/audit-log";

const emailSchema = z.string().trim().email();

async function forgotPasswordAction(formData: FormData) {
  "use server";

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    redirect("/forgot-password?error=invalid");
  }
  const email = parsed.data;

  try {
    await assertUnderKeyedRateLimit(email, "password_reset_requested", 5);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      // Same generic outcome as success — don't reveal that rate limiting
      // (vs. account existence) is why nothing more happens.
      redirect("/forgot-password?sent=1");
    }
    throw error;
  }

  const user = await db.user.findUnique({ where: { email } });

  // Always log the attempt and always show the same result, whether or not
  // the account exists — this is what keeps the endpoint from being usable
  // to enumerate registered emails.
  await logAuditEvent({
    userId: user?.id ?? null,
    eventType: "password_reset_requested",
    payload: { rateLimitKey: email },
  });

  if (user && !user.deactivatedAt) {
    const rawToken = await createPasswordResetToken(user.id);
    const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;

    await getEmailProvider().send({
      to: user.email,
      subject: "Reset your Cheil Delta password",
      text: `Someone requested a password reset for this Cheil Delta account.\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    });
  }

  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-md bg-celadon/40 px-3 py-3 text-sm text-black">
          If an account exists for that email, we&apos;ve sent a link to reset the password. It
          expires in 1 hour.
        </p>
        <p className="text-sm text-black/60">
          <Link href="/login" className="font-medium text-samsung-blue underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={forgotPasswordAction} className="space-y-4">
      <p className="text-sm text-black/60">
        Enter the email on your account and we&apos;ll send you a link to reset your password.
      </p>
      {error === "invalid" && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          Enter a valid email address.
        </p>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-black">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-samsung-blue px-3 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
      >
        Send reset link
      </button>
      <p className="text-center text-sm text-black/60">
        <Link href="/login" className="font-medium text-samsung-blue underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
