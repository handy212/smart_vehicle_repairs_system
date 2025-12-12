"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Car, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Select } from "@/components/ui/select";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      return appointmentsApi.list(params);
    },
    enabled: !!user && !!(user?.customer_profile?.id || (user as any)?.customer?.id),
  });

  const appointments = (appointmentsData?.results || appointmentsData || []) as any[];
  const today = new Date().toISOString().split("T")[0];
  const upcoming = appointments.filter(
    (apt: any) => apt.appointment_date >= today && ["pending", "confirmed"].includes(apt.status)
  );
  const past = appointments.filter(
    (apt: any) => apt.appointment_date < today || !["pending", "confirmed"].includes(apt.status)
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "confirmed":
        return "success";
      case "pending":
        return "warning";
      case "completed":
        return "default";
      case "cancelled":
        return "danger";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">My Appointments</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View and manage your service appointments
          </p>
        </div>
        {/* <div className="flex items-center space-x-2">
          <Link href="/portal/appointments/calendar">
            <Button variant="secondary">
              <Calendar className="w-4 h-4 mr-2" />
              Calendar View
            </Button>
          </Link>
          <Link href="/portal/book">
            <Button>Book New Appointment</Button>
          </Link>
        </div> */}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-400" />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Appointments */}
      {statusFilter === "all" && upcoming.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Upcoming Appointments
          </h2>
          <div className="space-y-4">
            {upcoming.map((apt: any) => (
              <Card key={apt.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <Link href={`/portal/appointments/${apt.id}`} className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Calendar className="w-5 h-5 text-blue-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                          {format(new Date(apt.appointment_date), "EEEE, MMMM d, yyyy")}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-2">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="w-4 h-4" />
                          <span>{apt.appointment_time}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Car className="w-4 h-4" />
                          <span>{apt.vehicle_info || "N/A"}</span>
                        </div>
                        {apt.customer_concerns && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                            {apt.customer_concerns}
                          </p>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center space-x-3">
                      <Badge variant={getStatusVariant(apt.status)}>{apt.status}</Badge>
                      <Link href={`/portal/appointments/${apt.id}`}>
                        <Button variant="secondary" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Past Appointments */}
      {(statusFilter === "all" || statusFilter !== "pending") && past.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {statusFilter === "all" ? "Past Appointments" : "Appointments"}
          </h2>
          <div className="space-y-4">
            {past.map((apt: any) => (
              <Card key={apt.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <Link href={`/portal/appointments/${apt.id}`} className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                          {format(new Date(apt.appointment_date), "EEEE, MMMM d, yyyy")}
                        </h3>
                      </div>
                      <div className="ml-8 space-y-2">
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Clock className="w-4 h-4" />
                          <span>{apt.appointment_time}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                          <Car className="w-4 h-4" />
                          <span>{apt.vehicle_info || "N/A"}</span>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center space-x-3">
                      <Badge variant={getStatusVariant(apt.status)}>{apt.status}</Badge>
                      <Link href={`/portal/appointments/${apt.id}`}>
                        <Button variant="secondary" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {appointments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              No appointments found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              {statusFilter !== "all"
                ? `No appointments with status "${statusFilter}" found.`
                : "You don't have any appointments yet. Book your first appointment to get started."}
            </p>
            <Link href="/portal/book">
              <Button>
                <Calendar className="w-4 h-4 mr-2" />
                Book Your First Appointment
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

