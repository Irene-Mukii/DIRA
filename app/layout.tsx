import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
// @ts-ignore CSS is loaded by Next.js and does not need TypeScript declarations.
import "./globals.css";
import PWARegister from "@/components/PWARegister";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DIRA - Classroom Observation System",
  description: "Teacher-focused classroom observation and learning pathway system",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DIRA" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
