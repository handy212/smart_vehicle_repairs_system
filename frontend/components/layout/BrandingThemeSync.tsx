"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";

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
            // Optional: compute a foreground color if it's too bright?
            // For now we assume white as specified in globals.css
        }

        if (secondaryColor) {
            root.style.setProperty("--secondary", secondaryColor);
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
