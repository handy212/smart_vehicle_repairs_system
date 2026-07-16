import type { MetadataRoute } from "next";
import { adminApi } from "@/lib/api/admin";
import { getMediaUrl } from "@/lib/api/utils";
import {
  brandingMediaVersion,
  brandingSettingValue,
  withCacheBuster,
} from "@/lib/branding/parse";
import { APP_CONFIG } from "@/lib/config";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = APP_CONFIG.name;
  let shortName = APP_CONFIG.name;
  let description = APP_CONFIG.description;
  let themeColor = "#1e4d6b";
  let backgroundColor = "#ffffff";
  const icons: MetadataRoute.Manifest["icons"] = [
    {
      src: "/icons/icon-192x192.png?v=2",
      sizes: "192x192",
      type: "image/png",
      purpose: "maskable",
    },
    {
      src: "/icons/icon-512x512.png?v=2",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ];

  try {
    const settings = await adminApi.settings.publicBranding();
    const siteName = brandingSettingValue(settings, "site_name");
    const companyName = brandingSettingValue(settings, "company_name");
    name = companyName || siteName || name;
    shortName = siteName || companyName || shortName;
    themeColor = brandingSettingValue(settings, "primary_color", themeColor);

    const faviconPath = brandingSettingValue(settings, "favicon_path");
    const logoPath = brandingSettingValue(settings, "logo_path");
    const iconPath = faviconPath || logoPath;

    if (iconPath) {
      const iconUrl = withCacheBuster(
        getMediaUrl(iconPath),
        brandingMediaVersion(settings, faviconPath ? "favicon_path" : "logo_path"),
      );
      if (iconUrl) {
        icons.unshift(
          {
            src: iconUrl,
            sizes: "any",
            type: "image/png",
            purpose: "any",
          },
          {
            src: iconUrl,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        );
      }
    }
  } catch {
    // fall back to static defaults
  }

  return {
    name,
    short_name: shortName,
    description,
    start_url: "/mobile/dashboard",
    scope: "/mobile",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
    icons,
  };
}
