"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { getContrastColor } from "@/lib/utils/color-utils";

export function BrandingThemeSync() {
    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey: ["settings", "branding", "public"],
        queryFn: () => adminApi.settings.publicBranding(),
        staleTime: 5 * 60 * 1000,
    });

    useEffect(() => {
        if (!brandingSettings) return;

        const primaryColor = brandingSettings.find((s) => s.key === "primary_color")?.value;
        const secondaryColor = brandingSettings.find((s) => s.key === "secondary_color")?.value;

        const root = document.documentElement;

        if (primaryColor) {
            root.style.setProperty("--primary", primaryColor);

            // Calculate contrast color for text on primary background
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

        // Favicon handling
        const faviconPath = brandingSettings.find((s) => s.key === "favicon_path")?.value;
        if (faviconPath) {
            const baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace("/api", "") || "http://localhost:8000";
            const faviconUrl = `${baseUrl}/media/${faviconPath}`;

            // Function to update or create link tag
            const updateLinkTag = (rel: string) => {
                let link = document.querySelector(`link[rel*='${rel}']`) as HTMLLinkElement;
                if (!link) {
                    link = document.createElement('link');
                    link.rel = rel;
                    document.head.appendChild(link);
                }
                link.href = faviconUrl;
            };

            updateLinkTag('icon');
            updateLinkTag('shortcut icon');
        }
    }, [brandingSettings]);

    return null;
}
