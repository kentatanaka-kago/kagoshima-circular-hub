import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { supabase } from "@/lib/supabase";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kagoshima Circular Hub",
  description:
    "鹿児島のサーキュラーエコノミー情報ポータル。県内43市町村・国の支援施策・実務報告を、動ける知見へと構造化。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data } = await supabase
    .from("news_articles")
    .select("scraped_at")
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single<{ scraped_at: string }>();

  const lastScraped = data?.scraped_at
    ? new Date(data.scraped_at).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <html lang="ja" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex flex-col">
              <Link href="/" className="font-semibold tracking-tight">
                Kagoshima Circular Hub
              </Link>
              {lastScraped && (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  情報取得: {lastScraped}
                </span>
              )}
            </div>
            <nav className="flex gap-5 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-950 dark:hover:text-zinc-50">最新情報</Link>
              <Link href="/calendar" className="hover:text-zinc-950 dark:hover:text-zinc-50">支援施策</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">{children}</main>
        <footer className="border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 py-6 text-center">
          出典は各記事のリンク先を参照してください。要約はAIによる補助的表示です。
        </footer>
      </body>
    </html>
  );
}
