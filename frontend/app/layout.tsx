import type { Metadata, Viewport } from "next";
import "./globals.css";
import "../styles/print.css";
import { Providers } from "./providers";
import { ThemeScript } from "./theme-script";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerGuard } from "@/components/pwa/ServiceWorkerGuard";

import { APP_CONFIG } from "@/lib/config";

import { adminApi } from "@/lib/api/admin";
import { getMediaUrl } from "@/lib/api/utils";
import {
  brandingMediaVersion,
  brandingSettingValue,
  withCacheBuster,
} from "@/lib/branding/parse";
import { unstable_cache } from "next/cache";

const getCachedPublicBranding = unstable_cache(
  async () => {
    const timeoutMs = process.env.NODE_ENV === "development" ? 1500 : 10_000;
    try {
      return await Promise.race([
        adminApi.settings.publicBranding(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("branding fetch timeout")), timeoutMs);
        }),
      ]);
    } catch {
      return [];
    }
  },
  ["root-public-branding"],
  { revalidate: 60, tags: ["branding"] }
);

export async function generateMetadata(): Promise<Metadata> {
  let companyName = APP_CONFIG.name;
  let icons: Metadata["icons"];

  try {
    const settings = await getCachedPublicBranding();
    const siteName = brandingSettingValue(settings, "site_name");
    const nameFromCompany = brandingSettingValue(settings, "company_name");
    companyName = nameFromCompany || siteName || companyName;

    const faviconPath = brandingSettingValue(settings, "favicon_path");
    const logoPath = brandingSettingValue(settings, "logo_path");
    const iconPath = faviconPath || logoPath;

    if (iconPath) {
      const iconUrl = withCacheBuster(
        getMediaUrl(iconPath),
        brandingMediaVersion(settings, faviconPath ? "favicon_path" : "logo_path"),
      );
      if (iconUrl) {
        icons = {
          icon: iconUrl,
          shortcut: iconUrl,
          apple: iconUrl,
        };
      }
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
    manifest: "/manifest.webmanifest",
    ...(icons ? { icons } : {}),
  };
}

export async function generateViewport(): Promise<Viewport> {
  let themeColor = "#1e4d6b";

  try {
    const settings = await getCachedPublicBranding();
    themeColor = brandingSettingValue(settings, "primary_color", themeColor);
  } catch {
    // keep default
  }

  return {
    themeColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

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
          <ServiceWorkerGuard />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
