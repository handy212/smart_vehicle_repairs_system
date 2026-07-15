"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Wrench } from "lucide-react";
import { AppShellSkeleton } from "@/components/shared/AppShellSkeleton";
import Link from "next/link";

export default function TechnicianLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { user, setUser, isAuthenticated, logout } = useAuthStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const checkAuth = async () => {
            if (!user) {
                try {
                    const currentUser = await authApi.getCurrentUser();
                    setUser(currentUser);
                } catch {
                    router.push("/login");
                }
            }
        };

        if (mounted) {
            checkAuth();
        }
    }, [user, setUser, router, mounted]);

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } finally {
            logout();
            router.push("/login");
        }
    };

    if (!mounted || !isAuthenticated) {
        return <AppShellSkeleton />;
    }

    return (
        <div className="min-h-screen bg-muted bg-background flex flex-col">
            {/* Technician Header */}
            <header className="bg-card border-b border-border h-16 px-4 flex items-center justify-between shadow-sm sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted hover:bg-muted">
                            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                        </Button>
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="bg-primary p-1.5 rounded-lg">
                            <Wrench className="h-5 w-5 text-white" />
                        </div>
                        <h1 className="text-lg font-bold text-foreground hidden sm:block">Tech Mode</h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <span className="text-sm font-medium text-foreground">{user?.first_name} {user?.last_name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{user?.role}</span>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive hover:text-destructive hover:bg-destructive/5 dark:hover:bg-destructive/10">
                        <LogOut className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 sm:p-6 overflow-y-auto w-full">
                {children}
            </main>
        </div>
    );
}
