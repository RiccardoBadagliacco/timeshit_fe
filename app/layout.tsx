import "@/styles/globals.css";
import { Metadata, Viewport } from "next";

import { Providers } from "./providers";

import { AppHeader } from "@/components/AppHeader";
import { HeaderProvider } from "@/components/HeaderContext";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "PoopLog Arcade ULTRA",
  description: "WebApp Telegram per tracciare le tue flushate eroiche.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff8e1" },
    { media: "(prefers-color-scheme: dark)", color: "#fff8e1" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="it">
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link
          crossOrigin="anonymous"
          href="https://fonts.gstatic.com"
          rel="preconnect"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Titan+One&family=Nunito:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased" style={{ overflowX: "hidden" }}>
        <Providers themeProps={{ attribute: "class", defaultTheme: "light" }}>
          <HeaderProvider>
            <div className="app-shell">
              <AppHeader />
              <PageShell>{children}</PageShell>
            </div>
          </HeaderProvider>
        </Providers>
      </body>
    </html>
  );
}
