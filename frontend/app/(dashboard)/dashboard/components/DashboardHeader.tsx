"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";
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
                <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                    <span className="text-foreground font-medium text-xs font-bold uppercase tracking-wider opacity-50">Overview</span>
                </div>
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                        Overview
                    </h1>
                    {currentTime && (
                        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                            </span>
                            Live • {currentTime}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    variant="outline"
                    className="h-9 bg-white dark:bg-gray-950"
                    onClick={() => router.push("/appointments/new")}
                >
                    <Calendar className="h-4 w-4 mr-2 text-gray-500" />
                    New Appointment
                </Button>
                <Button
                    size="sm"
                    className="h-9 shadow-sm"
                    onClick={() => router.push("/workorders/new")}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    New Work Order
                </Button>
            </div>
        </div>
    );
}
