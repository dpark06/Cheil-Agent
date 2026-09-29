import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

async function loginAction(formData: FormData) {
  "use server";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid");
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;

  return (
    <form action={loginAction} className="space-y-4">
      {reset && (
        <p className="rounded-md bg-celadon/40 px-3 py-2 text-sm text-black">
          Password reset. Sign in with your new password.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          Invalid email or password.
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
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium text-black">
            Password
          </label>
          <Link href="/forgot-password" className="text-xs font-medium text-samsung-blue underline">
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-samsung-blue px-3 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
      >
        Sign in
      </button>
      <p className="text-center text-sm text-black/60">
        No account?{" "}
        <Link href="/register" className="font-medium text-samsung-blue underline">
          Register
        </Link>
      </p>
    </form>
  );
}
