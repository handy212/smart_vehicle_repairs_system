"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { techniciansApi, PerformanceMetrics as PerformanceMetricsType } from "@/lib/api/technicians";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TrendingUp, TrendingDown, DollarSign, Clock, Briefcase, Calendar, Award, CheckCircle } from "lucide-react";
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
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!metrics) {
        return (
            <div className="text-center py-12 text-muted-foreground">
                No performance data available
            </div>
        );
    }

    const getPeriodLabel = (p: string) => {
        switch (p) {
            case 'week': return 'This Week';
            case 'month': return 'This Month';
            case 'quarter': return 'This Quarter';
            case 'year': return 'This Year';
            default: return 'All Time';
        }
    };

    return (
        <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Performance Overview</h3>
                    <p className="text-sm text-muted-foreground">Key metrics and analytics</p>
                </div>
                <Select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className="w-48"
                >
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="quarter">This Quarter</option>
                    <option value="year">This Year</option>
                    <option value="all">All Time</option>
                </Select>
            </div>

            {/* Productivity Metrics */}
            <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Briefcase className="h-3 w-3" />
                    Productivity
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard
                        title="Total Jobs"
                        value={metrics.productivity.total_jobs}
                        icon={Briefcase}
                        color="blue"
                    />
                    <MetricCard
                        title="Completed"
                        value={metrics.productivity.completed_jobs}
                        icon={CheckCircle}
                        color="green"
                    />
                    <MetricCard
                        title="In Progress"
                        value={metrics.productivity.in_progress_jobs}
                        icon={Clock}
                        color="orange"
                    />
                    <MetricCard
                        title="Completion Rate"
                        value={`${metrics.productivity.completion_rate}%`}
                        icon={TrendingUp}
                        color="purple"
                    />
                </div>
            </div>

            {/* Financial Metrics */}
            <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <DollarSign className="h-3 w-3" />
                    Financial Performance
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                    <MetricCard
                        title="Total Revenue"
                        value={`$${metrics.financial.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={DollarSign}
                        color="green"
                    />
                    <MetricCard
                        title="Avg Job Value"
                        value={`$${metrics.financial.avg_job_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        icon={TrendingUp}
                        color="blue"
                    />
                </div>
            </div>

            {/* Availability Metrics */}
            <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Availability & Hours
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricCard
                        title="Total Hours Worked"
                        value={`${metrics.availability.total_hours_worked.toFixed(1)}h`}
                        icon={Clock}
                        color="blue"
                    />
                    <MetricCard
                        title="Overtime Hours"
                        value={`${metrics.availability.overtime_hours.toFixed(1)}h`}
                        icon={TrendingUp}
                        color="orange"
                    />
                    <MetricCard
                        title="Active Days"
                        value={metrics.availability.active_days}
                        icon={Calendar}
                        color="purple"
                    />
                </div>
            </div>

            {/* Quality Metrics */}
            <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Quality Metrics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <MetricCard
                        title="Avg Completion Time"
                        value={`${metrics.productivity.avg_completion_days.toFixed(1)} days`}
                        icon={Clock}
                        color="blue"
                    // large
                    />
                    <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200 dark:border-green-800">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-1">Performance Score</p>
                                    <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                                        {calculatePerformanceScore(metrics)}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Based on productivity & quality</p>
                                </div>
                                <Award className="h-12 w-12 text-green-500 opacity-50" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

interface MetricCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    color: "blue" | "green" | "orange" | "purple";
}

function MetricCard({ title, value, icon: Icon, color }: MetricCardProps) {
    const colorClasses = {
        blue: "from-orange-50 to-cyan-50 dark:from-orange-950/30 dark:to-cyan-950/30",
        green: "from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30",
        orange: "from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30",
        purple: "from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30",
    };

    const iconColors = {
        blue: "text-primary dark:text-primary",
        green: "text-green-500 dark:text-green-400",
        orange: "text-orange-500 dark:text-orange-400",
        purple: "text-purple-500 dark:text-purple-400",
    };

    return (
        <Card className={cn("shadow-none border-none bg-gradient-to-br", colorClasses[color])}>
            <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {title}
                    </p>
                    <Icon className={cn("h-5 w-5 opacity-50", iconColors[color])} />
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {value}
                </p>
            </CardContent>
        </Card>
    );
}

function calculatePerformanceScore(metrics: PerformanceMetricsType): string {
    // Simple scoring algorithm based on completion rate and productivity
    const completionScore = metrics.productivity.completion_rate;
    const productivityScore = Math.min((metrics.productivity.completed_jobs / Math.max(metrics.productivity.total_jobs, 1)) * 100, 100);

    // Average of both scores
    const score = ((completionScore + productivityScore) / 2).toFixed(0);

    return `${score}/100`;
}
