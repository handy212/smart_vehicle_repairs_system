"use client";

import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/api/portal";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Clock,
  ArrowRight,
  AlertCircle
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PortalStatsGrid } from "./components/PortalStatsGrid";
import { PortalQuickActions } from "./components/PortalQuickActions";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function PortalHomePage() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => portalApi.dashboard(),
  });

  const { formatCurrency } = useCurrency();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Unable to load dashboard data</p>
      </div>
    );
  }

  const { stats, recent_appointments, recent_invoices } = dashboard;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Welcome, {user?.first_name || "Customer"}
          </h1>
        </div>
        <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-border">
          {format(new Date(), "EEEE, MMMM d, yyyy")}
        </div>
      </div>

      {/* Stats Grid */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Overview</h2>
        <PortalStatsGrid stats={stats} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area (2/3) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick Actions */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Quick Actions</h2>
            <PortalQuickActions />
          </section>

          {/* Recent Appointments */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Service</h2>
              <Link href="/portal/appointments" className="text-xs font-medium text-primary hover:text-primary flex items-center">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </div>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {recent_appointments.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recent_appointments.map((apt: { id: number; appointment_date: string; vehicle_info?: string; appointment_time: string; service_type?: string; status: string }) => (
                      <div key={apt.id} className="p-4 hover:bg-muted/50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-orange-900/20 flex items-center justify-center text-primary font-bold text-xs">
                            {format(new Date(apt.appointment_date), "d")}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground">{apt.vehicle_info || "Vehicle"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {apt.appointment_time} • {apt.service_type || "Service"}
                            </p>
                          </div>
                        </div>
                        <Badge variant={apt.status === "confirmed" ? "success" : "secondary"} className="uppercase text-[10px]">
                          {apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">No upcoming appointments.</div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Sidebar Area (1/3) */}
        <div className="space-y-8">
          {/* Recent Invoices */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Billing</h2>
              <Link href="/portal/invoices" className="text-xs font-medium text-primary hover:text-primary flex items-center">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Link>
            </div>
            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {recent_invoices.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {recent_invoices.map((inv: { id: number; invoice_number: string; total?: string | number; invoice_date: string; status: string }) => (
                      <Link
                        key={inv.id}
                        href={`/portal/invoices/${inv.id}`}
                        className="block p-4 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-mono text-xs font-medium text-muted-foreground">#{inv.invoice_number}</p>
                          <span className="font-bold text-sm text-foreground">
                            {formatCurrency(inv.total || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-muted-foreground">{format(new Date(inv.invoice_date), "MMM d, yyyy")}</p>
                          <Badge variant={inv.status === "paid" ? "success" : inv.status === "pending" ? "warning" : "secondary"} className="h-5 px-1.5 text-[10px] uppercase">
                            {inv.status}
                          </Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground text-sm">No recent invoices.</div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}


