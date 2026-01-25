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
    }, [brandingSettings]);

    return null;
}
