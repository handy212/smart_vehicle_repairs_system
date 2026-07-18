"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wrench } from "lucide-react";
import { useBranding } from "@/lib/hooks/useBranding";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { siteName, logoSrc } = useBranding("public");
    const pathname = usePathname();
    const isCareers = pathname?.startsWith("/careers");
    const badgeLabel = isCareers ? "Careers" : "Customer Portal";

    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <header className="bg-card border-b border-border sticky top-0 z-50">
                <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <Link href={isCareers ? "/careers" : "/"} className="flex items-center gap-2">
                        {logoSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logoSrc} alt={siteName} className="h-8 w-auto" />
                        ) : (
                            <div className="bg-primary p-1.5 rounded-lg">
                                <Wrench className="h-5 w-5 text-white" />
                            </div>
                        )}
                        <div className="font-bold text-lg text-foreground">{siteName}</div>
                    </Link>
                    <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1 rounded-md">
                        {badgeLabel}
                    </div>
                </div>
            </header>
            <main className="w-full px-4 sm:px-6 lg:px-8 py-8 flex-1">
                {children}
            </main>
            <footer className="bg-card border-t border-border mt-auto">
                <div className="w-full px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-muted-foreground">
                    Copyright American AutoParts @2026. Developed by SafeTrack Systems
                </div>
            </footer>
        </div>
    );
}
