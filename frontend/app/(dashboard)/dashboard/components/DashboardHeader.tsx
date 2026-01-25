"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PremiumIcons } from "@/components/ui/icons";
import { useRouter } from "next/navigation";

export function DashboardHeader() {
    const router = useRouter();
    const [currentTime, setCurrentTime] = useState<string>("");

    useEffect(() => {
        setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, []);

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                {/* Clean Header - Removed manual opacity breadcrumb */}
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-2">
                        <PremiumIcons.Dashboard className="w-8 h-8 text-primary dark:text-primary" />
                        Shop Overview
                    </h1>
                    {currentTime && (
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 dark:bg-orange-900/20 text-[10px] font-medium text-primary dark:text-orange-300 uppercase tracking-wider border border-orange-100 dark:border-orange-800">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Live • {currentTime}
                        </div>
                    )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Welcome back to your shop command center
                </p>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-9 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border-gray-200/50 hover:bg-white dark:hover:bg-gray-800 transition-all"
                    onClick={() => router.push("/appointments/new")}
                >
                    <PremiumIcons.Calendar className="h-4 w-4 mr-2 text-gray-500" />
                    New Appointment
                </Button>
                <Button
                    size="sm"
                    className="h-9 shadow-sm bg-primary hover:bg-primary/90 text-white border-none"
                    onClick={() => router.push("/workorders/new")}
                >
                    <PremiumIcons.PlusCircle className="h-4 w-4 mr-2" />
                    New Work Order
                </Button>
            </div>
        </div>
    );
}
