"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/hooks/useBranding";
import { getAccessToken } from "@/lib/utils/token";
import { getContrastColor } from "@/lib/utils/color-utils";

/**
 * Applies CSS variables, favicon, and theme color from branding settings.
 * Uses authenticated settings when logged in to avoid tight public rate limits.
 */
export function BrandingThemeSync() {
    const variant = typeof window !== "undefined" && getAccessToken() ? "authenticated" : "public";
    const { primaryColor, secondaryColor, faviconSrc, siteName } = useBranding(variant);

    useEffect(() => {
        const root = document.documentElement;

        if (primaryColor) {
            root.style.setProperty("--primary", primaryColor);
            const contrast = getContrastColor(primaryColor);
            const foreground = contrast === "black" ? "oklch(0.145 0 0)" : "oklch(1 0 0)";
            root.style.setProperty("--primary-foreground", foreground);
        }

        if (secondaryColor) {
            root.style.setProperty("--secondary", secondaryColor);
            const contrast = getContrastColor(secondaryColor);
            const foreground = contrast === "black" ? "oklch(0.145 0 0)" : "oklch(1 0 0)";
            root.style.setProperty("--secondary-foreground", foreground);
        }
    }, [primaryColor, secondaryColor]);

    useEffect(() => {
        if (!faviconSrc) return;

        const updateLinkTag = (rel: string, type?: string) => {
            const selector = type
                ? `link[rel='${rel}'][type='${type}']`
                : `link[rel='${rel}']`;
            let link = document.querySelector(selector) as HTMLLinkElement | null;
            if (!link) {
                link = document.createElement("link");
                link.rel = rel;
                if (type) link.type = type;
                document.head.appendChild(link);
            }
            link.href = faviconSrc;
        };

        updateLinkTag("icon");
        updateLinkTag("shortcut icon");
        updateLinkTag("apple-touch-icon");

        let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
        if (!themeMeta) {
            themeMeta = document.createElement("meta");
            themeMeta.name = "theme-color";
            document.head.appendChild(themeMeta);
        }
        if (primaryColor) {
            themeMeta.content = primaryColor;
        }
    }, [faviconSrc, primaryColor]);

    useEffect(() => {
        if (!siteName) return;
        const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
        if (appleTitle) {
            appleTitle.content = siteName;
        }
    }, [siteName]);

    return null;
}
