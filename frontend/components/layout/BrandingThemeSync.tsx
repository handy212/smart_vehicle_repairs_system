"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/hooks/useBranding";
import { useAuthStore } from "@/store/authStore";
import { ensureVisibleColor, getContrastColor } from "@/lib/utils/color-utils";
import { useTheme } from "@/lib/hooks/useTheme";

/**
 * Applies CSS variables, favicon, and theme color from branding settings.
 * Uses authenticated settings when logged in to avoid tight public rate limits.
 */
export function BrandingThemeSync() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const variant = isAuthenticated ? "authenticated" : "public";
    const { resolvedTheme } = useTheme();
    const {
        primaryColor,
        secondaryColor,
        successColor,
        dangerColor,
        warningColor,
        infoColor,
        faviconSrc,
        siteName,
    } = useBranding(variant);

    useEffect(() => {
        const root = document.documentElement;
        const isDark = resolvedTheme === "dark";

        const applySemantic = (
            cssVar: string,
            foregroundVar: string,
            raw: string | null | undefined,
        ) => {
            if (!raw) {
                root.style.removeProperty(cssVar);
                root.style.removeProperty(foregroundVar);
                return;
            }
            const visible = ensureVisibleColor(raw, isDark);
            root.style.setProperty(cssVar, visible);
            const contrast = getContrastColor(visible);
            root.style.setProperty(
                foregroundVar,
                contrast === "black" ? "oklch(0.145 0 0)" : "oklch(1 0 0)",
            );
        };

        if (primaryColor) {
            const visible = ensureVisibleColor(primaryColor, isDark);
            root.style.setProperty("--primary", visible);
            const contrast = getContrastColor(visible);
            const foreground = contrast === "black" ? "oklch(0.145 0 0)" : "oklch(1 0 0)";
            root.style.setProperty("--primary-foreground", foreground);
        }

        // Brand secondary is NOT the UI "secondary" surface token used by
        // Button variant="secondary". Overwriting --secondary made Cancel/Back
        // buttons unreadable when brand secondary was black/blue/etc.
        if (secondaryColor) {
            const visible = ensureVisibleColor(secondaryColor, isDark);
            root.style.setProperty("--brand-secondary", visible);
            const contrast = getContrastColor(visible);
            const foreground = contrast === "black" ? "oklch(0.145 0 0)" : "oklch(1 0 0)";
            root.style.setProperty("--brand-secondary-foreground", foreground);
            root.style.removeProperty("--secondary");
            root.style.removeProperty("--secondary-foreground");
        } else {
            root.style.removeProperty("--brand-secondary");
            root.style.removeProperty("--brand-secondary-foreground");
        }

        applySemantic("--success", "--success-foreground", successColor);
        applySemantic("--destructive", "--destructive-foreground", dangerColor);
        applySemantic("--warning", "--warning-foreground", warningColor);
        applySemantic("--info", "--info-foreground", infoColor);
    }, [
        primaryColor,
        secondaryColor,
        successColor,
        dangerColor,
        warningColor,
        infoColor,
        resolvedTheme,
    ]);

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
