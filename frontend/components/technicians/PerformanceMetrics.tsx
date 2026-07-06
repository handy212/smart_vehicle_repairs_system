"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { techniciansApi, PerformanceMetrics as PerformanceMetricsType } from "@/lib/api/technicians";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, DollarSign, Clock, Briefcase, Calendar, Award, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface PerformanceMetricsProps {
    technicianId: number;
}

export function PerformanceMetrics({ technicianId }: PerformanceMetricsProps) {
    const [period, setPeriod] = useState("month");

    const { data: metrics, isLoading } = useQuery({
        queryKey: ["performance-metrics", technicianId, period],
        queryFn: () => techniciansApi.getPerformanceMetrics(technicianId, period),
    });

    if (isLoading) {
        return (
            <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="rounded-lg border border-dashed bg-muted/20 py-8 text-center text-sm text-muted-foreground">
                No performance data available
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold">Performance Overview</h3>
                    <p className="text-xs text-muted-foreground">Key metrics for the selected period</p>
                </div>
                <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm sm:w-40"
                >
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="quarter">This Quarter</option>
                    <option value="year">This Year</option>
                    <option value="all">All Time</option>
                </select>
            </div>

            <MetricSection
                title="Productivity"
                icon={Briefcase}
                className="grid-cols-2 md:grid-cols-4"
            >
                <MetricCard
                    title="Total Jobs"
                    value={metrics.productivity.total_jobs}
                    icon={Briefcase}
                    tone="primary"
                />
                <MetricCard
                    title="Completed"
                    value={metrics.productivity.completed_jobs}
                    icon={CheckCircle}
                    tone="success"
                />
                <MetricCard
                    title="In Progress"
                    value={metrics.productivity.in_progress_jobs}
                    icon={Clock}
                    tone="warning"
                />
                <MetricCard
                    title="Completion"
                    value={`${metrics.productivity.completion_rate}%`}
                    icon={TrendingUp}
                />
            </MetricSection>

            <MetricSection
                title="Financial"
                icon={DollarSign}
                className="grid-cols-1 sm:grid-cols-2"
            >
                <MetricCard
                    title="Total Revenue"
                    value={`$${metrics.financial.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={DollarSign}
                    tone="success"
                />
                <MetricCard
                    title="Avg Job Value"
                    value={`$${metrics.financial.avg_job_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    icon={TrendingUp}
                    tone="primary"
                />
            </MetricSection>

            <MetricSection
                title="Availability"
                icon={Calendar}
                className="grid-cols-1 sm:grid-cols-3"
            >
                <MetricCard
                    title="Hours Worked"
                    value={`${metrics.availability.total_hours_worked.toFixed(1)}h`}
                    icon={Clock}
                    tone="primary"
                />
                <MetricCard
                    title="Overtime"
                    value={`${metrics.availability.overtime_hours.toFixed(1)}h`}
                    icon={TrendingUp}
                    tone="warning"
                />
                <MetricCard
                    title="Active Days"
                    value={metrics.availability.active_days}
                    icon={Calendar}
                />
            </MetricSection>

            <MetricSection
                title="Quality"
                icon={Award}
                className="grid-cols-1 sm:grid-cols-2"
            >
                <MetricCard
                    title="Avg Completion"
                    value={`${metrics.productivity.avg_completion_days.toFixed(1)} days`}
                    icon={Clock}
                    tone="primary"
                />
                <MetricCard
                    title="Performance Score"
                    value={calculatePerformanceScore(metrics)}
                    icon={Award}
                    tone="success"
                    helper="Based on productivity and completion rate"
                />
            </MetricSection>
        </div>
    );
}

interface MetricSectionProps {
    title: string;
    icon: React.ElementType;
    className?: string;
    children: React.ReactNode;
}

function MetricSection({ title, icon: Icon, className, children }: MetricSectionProps) {
    return (
        <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {title}
            </h4>
            <div className={cn("grid gap-2", className)}>
                {children}
            </div>
        </section>
    );
}

interface MetricCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    tone?: "default" | "primary" | "success" | "warning";
    helper?: string;
}

function MetricCard({ title, value, icon: Icon, tone = "default", helper }: MetricCardProps) {
    const toneClasses = {
        default: "text-muted-foreground",
        primary: "text-primary",
        success: "text-success",
        warning: "text-warning-foreground",
    };

    return (
        <Card className="border-border shadow-sm">
            <CardContent className="flex min-h-[78px] items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1">
                    <p className="truncate text-[11px] font-medium uppercase text-muted-foreground">
                        {title}
                    </p>
                    <p className="truncate text-lg font-semibold text-foreground">
                        {value}
                    </p>
                    {helper && (
                        <p className="truncate text-xs text-muted-foreground">
                            {helper}
                        </p>
                    )}
                </div>
                <div className="rounded-md border bg-muted/40 p-2">
                    <Icon className={cn("h-4 w-4", toneClasses[tone])} />
                </div>
            </CardContent>
        </Card>
    );
}

function calculatePerformanceScore(metrics: PerformanceMetricsType): string {
    const completionScore = metrics.productivity.completion_rate;
    const productivityScore = Math.min((metrics.productivity.completed_jobs / Math.max(metrics.productivity.total_jobs, 1)) * 100, 100);
    const score = ((completionScore + productivityScore) / 2).toFixed(0);

    return `${score}/100`;
}
