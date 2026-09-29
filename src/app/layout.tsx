import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cheil Delta",
  description: "Compare creative file versions and generate an AI-assisted review deck.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-black antialiased">{children}</body>
    </html>
  );
}
