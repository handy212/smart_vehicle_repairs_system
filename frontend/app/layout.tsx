import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/print.css";
import { Providers } from "./providers";
import { ThemeScript } from "./theme-script";

import { APP_CONFIG } from "@/lib/config";

import { adminApi } from "@/lib/api/admin";

export async function generateMetadata(): Promise<Metadata> {
  let companyName = APP_CONFIG.name;

  try {
    const settings = await adminApi.settings.publicBranding();
    const setting = settings.find((s) => s.key === "company_name" || s.key === "site_name");
    if (setting && setting.value) {
      companyName = setting.value;
    }
  } catch (error) {
    console.warn("Failed to fetch branding for metadata:", error);
  }

  return {
    title: {
      template: `${companyName} | %s`,
      default: companyName,
    },
    description: APP_CONFIG.description,
    manifest: "/manifest.json",
  };
}

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
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
        <meta name="referrer" content="no-referrer-when-downgrade" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
