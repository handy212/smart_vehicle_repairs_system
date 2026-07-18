"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { useCurrentUser, getCustomerId } from "@/lib/hooks/useCurrentUser";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { Appointment } from "@/lib/api/appointments";

export default function MyAppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: user } = useCurrentUser();
  const customerId = getCustomerId(user);

  const { data: appointmentsData, isLoading } = useQuery({
    queryKey: ["portal", "appointments", statusFilter],
    queryFn: () => {
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });

      const params: Record<string, string | number | boolean> = {
        customer: customerId,
        ordering: "-appointment_date,-appointment_time",
      };
      if (statusFilter !== "all" && statusFilter !== "upcoming" && statusFilter !== "past") {
        params.status = statusFilter;
      }
      return appointmentsApi.list(params);
    },
    enabled: !!user && !!customerId,
  });

  const appointments = (appointmentsData?.results || appointmentsData || []) as Appointment[];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "confirmed": return { variant: "success" as const, className: "bg-success/10 text-success border-success/20" };
      case "pending": return { variant: "warning" as const, className: "bg-warning/10 text-warning border-warning/20" };
      case "completed": return { variant: "default" as const, className: "bg-primary/10 text-primary border-primary/20" };
      case "cancelled": return { variant: "danger" as const, className: "bg-destructive/10 text-destructive border-destructive/20" };
      default: return { variant: "secondary" as const, className: "bg-muted text-muted-foreground border-transparent" };
    }
  };

  return (
    <div className="space-y-8 w-full">
      <PortalPageHeader
        title="Appointments"
        description="View and manage your service bookings. Stay on top of your vehicle's health."
        action={
          <Link href="/portal/book">
            <Button size="sm" className="gap-2">
              <PremiumIcons.Calendar className="w-4 h-4" />
              Book New Appointment
            </Button>
          </Link>
        }
      />

      <div className="space-y-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <div>
              <TabsContent value={statusFilter} className="mt-0 outline-none">
            <PortalList
              data={appointments}
              isLoading={isLoading}
              emptyMessage="No appointments found for this status."
              emptyAction={
                <Link href="/portal/book">
                  <Button variant="outline" size="sm" className="mt-4 gap-2 border-primary/20 hover:bg-primary/5 rounded-xl px-6 py-5 font-bold">
                    <PremiumIcons.Plus className="w-4 h-4 text-primary" />
                    Book Now
                  </Button>
                </Link>
              }
              columns={[
                {
                  header: "Schedule",
                  cell: (apt) => (
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-muted/50 flex flex-col items-center justify-center border border-border/50 group-hover/row:border-primary/30 transition-colors">
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground/60 leading-none mb-0.5">
                          {format(new Date(apt.appointment_date), "MMM")}
                        </span>
                        <span className="text-sm font-semibold text-foreground leading-none">
                          {format(new Date(apt.appointment_date), "d")}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-foreground">
                          {format(new Date(apt.appointment_date), "EEEE, MMMM d")}
                        </div>
                        <div className="flex items-center text-[11px] text-muted-foreground font-semibold uppercase tracking-widest gap-1.5 mt-0.5 opacity-60">
                          <PremiumIcons.Clock className="w-3 h-3 text-primary/60" />
                          {apt.appointment_time}
                        </div>
                      </div>
                    </div>
                  )
                },
                {
                  header: "Vehicle & Service",
                  cell: (apt) => (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground group-hover/row:text-primary transition-colors">
                        <PremiumIcons.Car className="w-4 h-4 opacity-40" />
                        {apt.vehicle_info || "Premium Vehicle"}
                      </div>
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                        <PremiumIcons.Tool className="w-3.5 h-3.5 opacity-40" />
                        {apt.service_type || "Standard Maintenance"}
                      </div>
                    </div>
                  )
                },
                {
                  header: "Status",
                  cell: (apt) => {
                    const config = getStatusConfig(apt.status);
                    return (
                      <Badge 
                        variant={config.variant} 
                        className={cn("capitalize text-[10px] font-semibold tracking-widest px-3 py-1 rounded-full border", config.className)}
                      >
                        {apt.status}
                      </Badge>
                    );
                  }
                },
                {
                  header: "Actions",
                  className: "text-right",
                  cell: (apt) => (
                    <div className="flex justify-end">
                      <Link href={`/portal/appointments/${apt.id}`}>
                        <Button variant="ghost" size="sm" className="gap-2 hover:bg-primary/5 hover:text-primary rounded-lg font-bold group/btn">
                          Details
                          <PremiumIcons.ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                      </Link>
                    </div>
                  )
                }
              ]}
              renderMobileItem={(apt) => {
                const config = getStatusConfig(apt.status);
                return (
                  <PortalCard
                    key={apt.id}
                    href={`/portal/appointments/${apt.id}`}
                    icon={<PremiumIcons.Calendar className="w-6 h-6" />}
                    title={format(new Date(apt.appointment_date), "EEEE, MMM d")}
                    subtitle={
                      <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center gap-2 font-bold text-foreground">
                          <PremiumIcons.Clock className="w-3.5 h-3.5 text-primary" /> {apt.appointment_time}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold uppercase text-muted-foreground/60 tracking-widest">{apt.vehicle_info}</span>
                          <span className="text-[10px] font-medium opacity-50">{apt.service_type}</span>
                        </div>
                        <div className="mt-1">
                          <Badge 
                            variant={config.variant} 
                            className={cn("capitalize text-[9px] font-semibold tracking-widest px-2 py-0.5 rounded-full border", config.className)}
                          >
                            {apt.status}
                          </Badge>
                        </div>
                      </div>
                    }
                  />
                );
              }}
            />
              </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
