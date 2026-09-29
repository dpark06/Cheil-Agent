import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { consumePasswordResetToken } from "@/lib/security/password-reset";
import { logAuditEvent } from "@/lib/audit/audit-log";

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8).max(200),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
  });

async function resetPasswordAction(formData: FormData) {
  "use server";

  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const reason = parsed.error.issues.some((i) => i.message === "Passwords don't match")
      ? "mismatch"
      : "invalid";
    redirect(`/reset-password?token=${formData.get("token")}&error=${reason}`);
  }

  const userId = await consumePasswordResetToken(parsed.data.token);
  if (!userId) {
    redirect("/reset-password?error=expired");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  await logAuditEvent({ userId, eventType: "password_reset_completed" });

  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (error === "expired") {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          This reset link is invalid, expired, or already used. Reset links are single-use and
          expire after 1 hour.
        </p>
        <p className="text-sm text-black/60">
          <Link href="/forgot-password" className="font-medium text-samsung-blue underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          This reset link is missing its token. Request a new one.
        </p>
        <p className="text-sm text-black/60">
          <Link href="/forgot-password" className="font-medium text-samsung-blue underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={resetPasswordAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {error === "mismatch" && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          Passwords don&apos;t match.
        </p>
      )}
      {error === "invalid" && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          Password must be at least 8 characters.
        </p>
      )}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-black">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-black">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minLength={8}
          required
          className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-samsung-blue px-3 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
      >
        Reset password
      </button>
    </form>
  );
}
