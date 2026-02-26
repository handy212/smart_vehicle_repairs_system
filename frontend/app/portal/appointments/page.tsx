"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { authApi } from "@/lib/api/auth";
import { Calendar, Clock, Car, Plus, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortalPageHeader } from "../components/PortalPageHeader";
import { PortalList } from "../components/PortalList";
import { PortalCard } from "../components/PortalCard";

export default function MyAppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: appointmentsData, isLoading } = useQuery({
    queryKey: ["portal", "appointments", statusFilter],
    queryFn: () => {

      const customerId = user?.customer_profile?.id || (user as any)?.customer?.id;
      if (!customerId) return Promise.resolve({ count: 0, next: null, previous: null, results: [] });

      const params: any = {
        customer: customerId,
        ordering: "-appointment_date,-appointment_time",
      };
      if (statusFilter !== "all" && statusFilter !== "upcoming" && statusFilter !== "past") {
        // Direct status filter
        params.status = statusFilter;
      }
      return appointmentsApi.list(params);
    },

    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });


  const appointments = (appointmentsData?.results || appointmentsData || []) as any[];

  // Client-side filtering for "upcoming" vs "past" tabs if needed, 
  // but for simplicity we'll just show the list based on the API response for now.
  // Ideally, "upcoming" and "past" would filter by date in the backend.

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "confirmed": return "success";
      case "pending": return "warning";
      case "completed": return "default";
      case "cancelled": return "danger";
      default: return "secondary";
    }
  };

  return (
    <div>
      <PortalPageHeader
        title="Appointments"
        action={
          <Link href="/portal/book">
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Book Appointment
            </Button>
          </Link>
        }
      />

      <div className="mt-6">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value={statusFilter} className="mt-0">
            <PortalList
              data={appointments}
              isLoading={isLoading}
              emptyMessage="No appointments found."
              emptyAction={
                <Link href="/portal/book">
                  <Button variant="outline" size="sm" className="mt-4 gap-2">
                    <Calendar className="w-4 h-4" />
                    Book Appointment
                  </Button>
                </Link>
              }
              columns={[
                {
                  header: "Date & Time",
                  cell: (apt) => (
                    <div>
                      <div className="font-semibold text-foreground">
                        {format(new Date(apt.appointment_date), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center text-xs text-muted-foreground gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {apt.appointment_time}
                      </div>
                    </div>
                  )
                },
                {
                  header: "Vehicle",
                  cell: (apt) => (
                    <div className="flex items-center gap-2 text-sm text-card-foreground">
                      <Car className="w-4 h-4 text-muted-foreground" />
                      {apt.vehicle_info || "N/A"}
                    </div>
                  )
                },
                {
                  header: "Service",
                  cell: (apt) => (
                    <div className="max-w-xs">
                      <div className="text-sm font-medium text-foreground">{apt.service_type || "Service"}</div>
                      {apt.customer_concerns && (
                        <div className="text-xs text-muted-foreground truncate">{apt.customer_concerns}</div>
                      )}
                    </div>
                  )
                },
                {
                  header: "Status",
                  cell: (apt) => (
                    <Badge variant={getStatusVariant(apt.status)} className="capitalize">
                      {apt.status}
                    </Badge>
                  )
                },
                {
                  header: "Action",
                  className: "text-right",
                  cell: (apt) => (
                    <div className="flex justify-end">
                      <Link href={`/portal/appointments/${apt.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          Details
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  )
                }
              ]}
              renderMobileItem={(apt) => (
                <PortalCard
                  key={apt.id}
                  href={`/portal/appointments/${apt.id}`}
                  icon={<Calendar className="w-5 h-5 text-primary" />}
                  title={format(new Date(apt.appointment_date), "EEEE, MMM d")}
                  subtitle={
                    <span className="flex flex-col gap-1 mt-1">
                      <span className="flex items-center gap-1.5 font-medium text-card-foreground">
                        <Clock className="w-3 h-3" /> {apt.appointment_time}
                      </span>
                      <span className="text-xs text-muted-foreground">{apt.vehicle_info}</span>
                    </span>
                  }
                  status={
                    <Badge variant={getStatusVariant(apt.status)} className="capitalize text-[10px] h-5 px-1.5">
                      {apt.status}
                    </Badge>
                  }
                />
              )}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

