import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/print.css";
import { Providers } from "./providers";
import { ThemeScript } from "./theme-script";

export const metadata: Metadata = {
  title: "Smart Vehicle Repairs",
  description: "Comprehensive vehicle repair and workshop management system",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

import { Toaster } from "@/components/ui/toaster";
import Script from "next/script";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <meta name="referrer" content="no-referrer-when-downgrade" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        {/* Google Sign-In SDK for OAuth */}
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="beforeInteractive"
        />
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
