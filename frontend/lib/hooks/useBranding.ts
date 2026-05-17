"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type SystemSetting } from "@/lib/api/admin";
import { useTheme } from "@/lib/hooks/useTheme";

/** Shared media-URL builder derived from the API base URL. */
function getMediaBaseUrl() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
    return apiUrl.replace(/\/api\/?$/, "");
}

interface BrandingResult {
    siteName: string;
    tagline: string;
    primaryColor: string;
    logoPath: string | null;
    logoDarkPath: string | null;
    loginBackground: string | null;
    selfRegistrationEnabled: boolean;
    /** The resolved logo URL (theme-aware) or null. */
    logoSrc: string | null;
    /** Helper to convert a relative media path to a full URL. */
    getMediaUrl: (path: string, cacheKey?: number) => string;
}

/**
 * Centralised branding hook.
 *
 * Fetches branding settings once, caches for 5 min, and provides
 * theme-aware logo resolution + a media-URL helper.
 *
 * @param queryKeyVariant – pass `"authenticated"` in dashboard/portal layouts
 *   (uses by-category endpoint) or `"public"` (default) for unauthenticated
 *   pages like the login screen.
 */
export function useBranding(
    queryKeyVariant: "public" | "authenticated" = "public",
): BrandingResult {
    const { resolvedTheme } = useTheme();

    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey:
            queryKeyVariant === "authenticated"
                ? ["settings", "branding"]
                : ["settings", "branding", "public"],
        queryFn: () =>
            queryKeyVariant === "authenticated"
                ? adminApi.settings.byCategory("branding")
                : adminApi.settings.publicBranding(),
        staleTime: 5 * 60 * 1000,
        retry: 2,
    });

    const mediaBaseUrl = useMemo(() => getMediaBaseUrl(), []);

    const getMediaUrl = useCallback(
        (path: string, cacheKey?: number) => {
            if (path.startsWith("http")) {
                return cacheKey
                    ? `${path}${path.includes("?") ? "&" : "?"}v=${cacheKey}`
                    : path;
            }
            const url = `${mediaBaseUrl}/media/${path}`;
            return cacheKey
                ? `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}`
                : url;
        },
        [mediaBaseUrl],
    );

    const branding = useMemo(() => {
        const getSetting = (key: string): string | null => {
            const setting = brandingSettings?.find((s) => s.key === key);
            return setting?.value && setting.value.trim() !== "" ? setting.value : null;
        };

        const getUpdatedAt = (key: string): string | null => {
            const setting = brandingSettings?.find((s) => s.key === key);
            return setting?.updated_at || null;
        };

        const siteName = getSetting("site_name") || "Smart Vehicle Repairs";
        const tagline = getSetting("company_tagline") || "Management System";
        const primaryColor = getSetting("primary_color") || "#ff8040";
        const logoPath = getSetting("logo_path");
        const logoDarkPath = getSetting("logo_dark_path");
        const loginBackground = getSetting("login_background");
        const selfRegistrationEnabled = getSetting("self_registration_enabled") !== "false";
        const logoUpdatedAt = getUpdatedAt("logo_path");
        const logoDarkUpdatedAt = getUpdatedAt("logo_dark_path");

        // Theme-aware logo resolution
        const isDark = resolvedTheme === "dark";
        let logoSrc: string | null = null;

        if (isDark && logoDarkPath) {
            const ck = logoDarkUpdatedAt
                ? new Date(logoDarkUpdatedAt).getTime()
                : undefined;
            logoSrc = getMediaUrl(logoDarkPath, ck);
        } else if (logoPath) {
            const ck = logoUpdatedAt
                ? new Date(logoUpdatedAt).getTime()
                : undefined;
            logoSrc = getMediaUrl(logoPath, ck);
        }

        return {
            siteName,
            tagline,
            primaryColor,
            logoPath,
            logoDarkPath,
            loginBackground,
            selfRegistrationEnabled,
            logoSrc,
            getMediaUrl,
        };
    }, [brandingSettings, resolvedTheme, getMediaUrl]);

    return branding;
}
