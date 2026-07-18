"use client";

import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/api/portal";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, AlertCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalStatsGrid } from "./components/PortalStatsGrid";
import { PortalQuickActions } from "./components/PortalQuickActions";
import { PortalActionsNeeded } from "./components/PortalActionsNeeded";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { cn } from "@/lib/utils/cn";

const appointmentStatusColors: Record<string, string> = {
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/15 text-warning border-warning/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const invoiceStatusColors: Record<string, string> = {
  paid: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/15 text-warning border-warning/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function PortalHomePage() {
  const { data: user } = useCurrentUser();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => portalApi.dashboard(),
  });

  const { formatCurrency } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded" />
          <Skeleton className="h-4 w-64 rounded opacity-50" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="lg:col-span-2 h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-lg font-bold text-foreground mb-1">Something went wrong</h2>
        <p className="text-sm text-muted-foreground max-w-sm">Could not load your dashboard. Please try refreshing.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  const { stats, recent_appointments, recent_invoices, actions_needed = [] } = dashboard;
  const firstName = user?.first_name || user?.username || "there";

  return (
    <div className="space-y-6 pb-24 lg:pb-8 w-full lg:max-w-none">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Welcome back, {firstName}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what needs your attention.</p>
      </div>

      {/* Actions needed — first on mobile */}
      <PortalActionsNeeded actions={actions_needed} />

      {/* Stats */}
      <PortalStatsGrid stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Quick Actions + Appointments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">Quick Actions</h2>
            <PortalQuickActions />
          </div>

          {/* Recent Appointments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">Upcoming Service</h2>
              <Link href="/portal/appointments" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <Card>
              <CardContent className="p-0">
                {recent_appointments.length > 0 ? (
                  <div className="divide-y divide-border">
                    {recent_appointments.map((apt) => (
                      <div key={apt.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {format(new Date(apt.appointment_date), "dd")}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{apt.vehicle_info || "Vehicle"}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(apt.appointment_date), "MMM d")} · {apt.appointment_time}
                              {apt.service_type && ` · ${apt.service_type}`}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-semibold capitalize border", appointmentStatusColors[apt.status] || "bg-muted text-muted-foreground")}
                        >
                          {apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <p className="text-sm">No upcoming appointments</p>
                    <Link href="/portal/book" className="text-xs text-primary mt-2 hover:underline">Book one now</Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right: Recent Invoices */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.1em]">Recent Invoices</h2>
            <Link href="/portal/invoices" className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <Card>
            <CardContent className="p-0">
              {recent_invoices.length > 0 ? (
                <div className="divide-y divide-border">
                  {recent_invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href={`/portal/invoices/${inv.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-mono font-semibold text-foreground">#{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(inv.invoice_date), "MMM d, yyyy")}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{formatCurrency(inv.total || 0)}</p>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] font-semibold capitalize border mt-0.5", invoiceStatusColors[inv.status] || "bg-muted text-muted-foreground")}
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  <p className="text-sm">No recent invoices</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
