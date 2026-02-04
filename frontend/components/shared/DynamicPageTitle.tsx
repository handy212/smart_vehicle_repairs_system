"use client";

import { useEffect } from "react";
import { APP_CONFIG } from "@/lib/config";

import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";

interface DynamicPageTitleProps {
    title: string;
    prefix?: string; // Optional prefix to override company name
}

export function DynamicPageTitle({ title, prefix }: DynamicPageTitleProps) {
    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey: ["settings", "branding", "public"],
        queryFn: () => adminApi.settings.publicBranding(),
        staleTime: 60 * 60 * 1000, // 1 hour
        retry: 2,
    });

    useEffect(() => {
        let companyName = prefix || APP_CONFIG.name;

        if (!prefix && brandingSettings) {
            const setting = brandingSettings.find(s => s.key === "company_name" || s.key === "site_name");
            if (setting && setting.value) {
                companyName = setting.value;
            }
        }

        document.title = `${companyName} | ${title}`;
    }, [title, prefix, brandingSettings]);

    return null;
}
