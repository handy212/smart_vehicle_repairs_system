"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/hooks/useBranding";
import { getAccessToken } from "@/lib/utils/token";
import { getContrastColor } from "@/lib/utils/color-utils";

/**
 * Applies CSS variables and favicon from branding settings.
 * Uses authenticated settings when logged in to avoid tight public rate limits.
 */
export function BrandingThemeSync() {
    const variant = typeof window !== "undefined" && getAccessToken() ? "authenticated" : "public";
    const { primaryColor, secondaryColor, faviconPath, getMediaUrl } = useBranding(variant);

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
        if (!faviconPath) return;
        const faviconUrl = getMediaUrl(faviconPath);

        const updateLinkTag = (rel: string) => {
            let link = document.querySelector(`link[rel*='${rel}']`) as HTMLLinkElement;
            if (!link) {
                link = document.createElement("link");
                link.rel = rel;
                document.head.appendChild(link);
            }
            link.href = faviconUrl;
        };

        updateLinkTag("icon");
        updateLinkTag("shortcut icon");
    }, [faviconPath, getMediaUrl]);

    return null;
}
