import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-morning-sky">
      <header className="border-b border-stone bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-sm font-semibold text-samsung-blue">
            Cheil Delta
          </Link>
          <div className="flex items-center gap-4 text-sm text-black">
            <span>{session?.user?.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="font-medium text-samsung-blue underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
