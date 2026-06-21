"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { adminApi, type SystemSetting } from "@/lib/api/admin";
import { useTheme } from "@/lib/hooks/useTheme";
import { getMediaUrl as resolveMediaUrl } from "@/lib/api/utils";
import { brandingMediaVersion, withCacheBuster } from "@/lib/branding/parse";

interface BrandingResult {
    siteName: string;
    companyName: string;
    tagline: string;
    primaryColor: string;
    secondaryColor: string | null;
    logoPath: string | null;
    logoDarkPath: string | null;
    loginBackground: string | null;
    selfRegistrationEnabled: boolean;
    faviconPath: string | null;
    /** Resolved favicon URL with cache-busting, or null. */
    faviconSrc: string | null;
    /** Resolved login background URL with cache-busting, or null. */
    loginBackgroundSrc: string | null;
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
        queryFn: async () => {
            if (queryKeyVariant === "authenticated") {
                try {
                    return await adminApi.settings.byCategory("branding");
                } catch (error) {
                    // Stale persisted auth state — fall back to the public branding endpoint.
                    if (isAxiosError(error) && error.response?.status === 401) {
                        return adminApi.settings.publicBranding();
                    }
                    throw error;
                }
            }
            return adminApi.settings.publicBranding();
        },
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: (failureCount, error) => {
            if (isAxiosError(error) && error.response?.status === 429) {
                return false;
            }
            return failureCount < 2;
        },
    });

    const getMediaUrl = useCallback((path: string, cacheKey?: number) => {
        const url = resolveMediaUrl(path);
        if (!cacheKey || !url) return url;
        return `${url}${url.includes("?") ? "&" : "?"}v=${cacheKey}`;
    }, []);

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
        const companyName =
            getSetting("company_name") || siteName;
        const tagline = getSetting("company_tagline") || "Management System";
        const primaryColor = getSetting("primary_color") || "#ff8040";
        const secondaryColor = getSetting("secondary_color");
        const logoPath = getSetting("logo_path");
        const logoDarkPath = getSetting("logo_dark_path");
        const loginBackground = getSetting("login_background");
        const faviconPath = getSetting("favicon_path");
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
            logoSrc = getMediaUrl(logoDarkPath, ck) || null;
        } else if (logoPath) {
            const ck = logoUpdatedAt
                ? new Date(logoUpdatedAt).getTime()
                : undefined;
            logoSrc = getMediaUrl(logoPath, ck) || null;
        }

        return {
            siteName,
            companyName,
            tagline,
            primaryColor,
            secondaryColor,
            logoPath,
            logoDarkPath,
            loginBackground,
            faviconPath,
            faviconSrc: faviconPath
                ? withCacheBuster(
                    getMediaUrl(faviconPath) || "",
                    brandingMediaVersion(brandingSettings, "favicon_path"),
                ) || null
                : null,
            loginBackgroundSrc: loginBackground
                ? withCacheBuster(
                    getMediaUrl(loginBackground) || "",
                    brandingMediaVersion(brandingSettings, "login_background"),
                ) || null
                : null,
            selfRegistrationEnabled,
            logoSrc,
            getMediaUrl,
        };
    }, [brandingSettings, resolvedTheme, getMediaUrl]);

    return branding;
}
