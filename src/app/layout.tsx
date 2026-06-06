import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Elegoo Design Reference Library",
  description: "A curated case library for EDM, websites, and product detail pages."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="page-shell">
          <header className="global-nav">
            <div className="global-nav__inner">
              <Link className="brand-mark" href="/">
                <span className="brand-dot" aria-hidden="true" />
                Design Library
              </Link>
              <nav className="nav-links" aria-label="Primary navigation">
                <Link href="/">案例库</Link>
                <Link href="/?type=email">EDM</Link>
                <Link href="/?type=website">官网</Link>
                <Link href="/admin">后台</Link>
              </nav>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
