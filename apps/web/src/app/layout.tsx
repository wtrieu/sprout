import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprout",
  description: "Family parenting copilot, storybooks & activities",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

const navItems = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Ask" },
  { href: "/library", label: "Library" },
  { href: "/stories", label: "Stories" },
  { href: "/activities", label: "Activities" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              <span className="text-amber-400">❋</span> Sprout
            </Link>
            <nav className="flex gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-1 text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
