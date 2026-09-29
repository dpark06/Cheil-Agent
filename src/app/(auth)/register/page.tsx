import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

async function registerAction(formData: FormData) {
  "use server";

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    redirect("/register?error=exists");
  }

  const userCount = await db.user.count();
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      // First registered user administers the instance (no invite/SSO flow in this MVP).
      role: userCount === 0 ? "ADMIN" : "REVIEWER",
    },
  });

  try {
    await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <form action={registerAction} className="space-y-4">
      {error === "exists" && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          An account with that email already exists.
        </p>
      )}
      {error === "invalid" && (
        <p className="rounded-md bg-pulse/10 px-3 py-2 text-sm text-pulse">
          Please check your details (password must be at least 8 characters).
        </p>
      )}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-black">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="mt-1 w-full rounded-md border border-stone px-3 py-2 text-sm focus:border-samsung-blue focus:outline-none"
        />
      </div>
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
        <label htmlFor="password" className="block text-sm font-medium text-black">
          Password
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
      <button
        type="submit"
        className="w-full rounded-md bg-samsung-blue px-3 py-2 text-sm font-medium text-white hover:bg-harbor-blue"
      >
        Create account
      </button>
      <p className="text-center text-sm text-black/60">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-samsung-blue underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
