import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/print.css";
import { Providers } from "./providers";
import { ThemeScript } from "./theme-script";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Smart Vehicle Repairs",
  description: "Comprehensive vehicle repair and workshop management system",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tech App",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-180x180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
};

import { Toaster } from "@/components/ui/toaster";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Tech App" />
        <link rel="apple-touch-icon" href="/icons/icon-180x180.png" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster />
          <ServiceWorkerRegistration />
        </Providers>
      </body>
    </html>
  );
}
