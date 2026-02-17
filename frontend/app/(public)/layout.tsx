"use client";

import { Wrench } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, SystemSetting } from "@/lib/api/admin";
import { useMemo } from "react";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey: ["settings", "branding", "public"],
        queryFn: () => adminApi.settings.publicBranding(),
        staleTime: 5 * 60 * 1000,
    });

    const branding = useMemo(() => {
        if (!brandingSettings) {
            return {
                site_name: "Smart Repairs",
                company_name: "Smart Vehicle Repairs",
                logo_path: null,
            };
        }

        const getSetting = (key: string): string | null => {
            const setting = brandingSettings.find((s) => s.key === key);
            return setting?.value && setting.value.trim() !== "" ? setting.value : null;
        };

        return {
            site_name: getSetting("site_name") || "Smart Repairs",
            company_name: getSetting("company_name") || "Smart Vehicle Repairs",
            logo_path: getSetting("logo_path"),
        };
    }, [brandingSettings]);

    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <header className="bg-card border-b border-border sticky top-0 z-50">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {branding.logo_path ? (
                            <img src={`/media/${branding.logo_path}`} alt={branding.site_name} className="h-8 w-auto" />
                        ) : (
                            <div className="bg-primary p-1.5 rounded-lg">
                                <Wrench className="h-5 w-5 text-white" />
                            </div>
                        )}
                        <div className="font-bold text-lg text-foreground">{branding.site_name}</div>
                    </div>
                    <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        Customer Portal
                    </div>
                </div>
            </header>
            <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
                {children}
            </main>
            <footer className="bg-card border-t border-border mt-auto">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-muted-foreground">
                    &copy; {new Date().getFullYear()} {branding.company_name}. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
