import "@/styles/globals.css";
import { Metadata, Viewport } from "next";
import { Providers } from "./providers";

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Titan+One&family=Nunito:wght@700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen antialiased bg-[#fff8e1]"
        style={{ overflowX: "hidden" }}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "light" }}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
