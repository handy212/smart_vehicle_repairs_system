"use client";

import { useEffect } from "react";
import { APP_CONFIG } from "@/lib/config";
import { useBranding } from "@/lib/hooks/useBranding";

interface DynamicPageTitleProps {
    title: string;
    prefix?: string;
}

export function DynamicPageTitle({ title, prefix }: DynamicPageTitleProps) {
    const { siteName, companyName } = useBranding("public");

    useEffect(() => {
        const company = prefix || companyName || siteName || APP_CONFIG.name;
        document.title = `${company} | ${title}`;
    }, [title, prefix, companyName, siteName]);

    return null;
}
