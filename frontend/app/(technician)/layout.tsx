"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Wrench } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
            const token = localStorage.getItem("access_token");

            if (!token) {
                router.push("/login");
                return;
            }

            if (!user && token) {
                try {
                    const currentUser = await authApi.getCurrentUser();
                    setUser(currentUser);
                } catch (error) {
                    router.push("/login");
                }
            }
        };

        if (mounted) {
            checkAuth();
        }
    }, [user, setUser, router, mounted]);

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    if (!mounted || !isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted bg-background">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                    <p className="mt-4 text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
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
                    <ThemeToggle />
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10">
                        <LogOut className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-5xl mx-auto w-full">
                {children}
            </main>
        </div>
    );
}
