export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-morning-sky px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold text-samsung-blue">Cheil Delta</h1>
          <p className="text-sm text-black/60">Creative version comparison &amp; review</p>
        </div>
        {children}
      </div>
    </div>
  );
}
