"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PremiumIcons } from "@/components/ui/icons";

interface DashboardHeaderProps {
    todayLabel: string;
    summary: string;
    spotlight: Array<{
        label: string;
        value: string;
    }>;
}

export function DashboardHeader({ todayLabel, summary, spotlight }: DashboardHeaderProps) {
    const [currentTime, setCurrentTime] = useState<string>(() =>
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        }, 60_000);

        return () => window.clearInterval(intervalId);
    }, []);

    return (
        <div className="relative overflow-hidden rounded-[28px] border border-border/60 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-6 shadow-sm dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,23,42,0.88))] sm:p-8">
            <div className="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.25em]">
                            {todayLabel}
                        </Badge>
                        {currentTime && (
                            <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                                </span>
                                Live {currentTime}
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
                                <PremiumIcons.Dashboard className="h-7 w-7" />
                            </span>
                            Workshop Command Center
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                            {summary}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {spotlight.map((item) => (
                            <div key={item.label} className="rounded-2xl border border-border/60 bg-background/70 p-4 backdrop-blur-sm">
                                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                                    {item.label}
                                </p>
                                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                                    {item.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        size="lg"
                        variant="outline"
                        className="h-11 rounded-xl border-border/60 bg-background/80 px-5 backdrop-blur-sm"
                        asChild
                    >
                        <Link href="/appointments/new">
                            <PremiumIcons.Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                            New Appointment
                        </Link>
                    </Button>
                    <Button
                        size="lg"
                        className="h-11 rounded-xl border-none bg-primary px-5 text-white shadow-sm hover:bg-primary/90"
                        asChild
                    >
                        <Link href="/workorders/new">
                            <PremiumIcons.PlusCircle className="mr-2 h-4 w-4" />
                            New Work Order
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
