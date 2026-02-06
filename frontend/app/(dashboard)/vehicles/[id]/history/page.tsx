"use client";

import { useQuery } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wrench, Calendar, Gauge, FileText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function VehicleHistoryPage() {
    const { formatCurrency } = useCurrency();
  const params = useParams();
  const id = parseInt(params.id as string);

  const { data: vehicle, isLoading: vehicleLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => vehiclesApi.get(id),
  });

  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery({
    queryKey: ["workorders", "vehicle", id],
    queryFn: () => workordersApi.list({ customer: undefined }), // We'll filter client-side
    enabled: !!id,
  });

  const { data: appointmentsData, isLoading: appointmentsLoading } = useQuery({
    queryKey: ["appointments", "vehicle", id],
    queryFn: () => appointmentsApi.list(),
    enabled: !!id,
  });

  if (vehicleLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Vehicle not found.</p>
        <Link href="/vehicles">
          <Button className="mt-4"variant="secondary">
            Back to Vehicles
          </Button>
        </Link>
      </div>
    );
  }

  // Filter work orders and appointments for this vehicle
  const vehicleWorkOrders =
    workOrdersData?.results?.filter(
      (wo) =>
        (typeof wo.vehicle === "object" && wo.vehicle !== null
          ? wo.vehicle.id
          : wo.vehicle) === id
    ) || [];

  const vehicleAppointments =
    appointmentsData?.results?.filter(
      (apt) =>
        (typeof apt.vehicle === "object" && apt.vehicle !== null
          ? apt.vehicle.id
          : apt.vehicle) === id
    ) || [];

  // Combine and sort by date
  const timelineItems: Array<{
    type: "work_order" | "appointment";
    date: string;
    title: string;
    description: string;
    status: string;
    id: number;
  }> = [];

  vehicleWorkOrders.forEach((wo) => {
    timelineItems.push({
      type: "work_order",
      date: wo.created_at,
      title: `Work Order ${wo.work_order_number}`,
      description: wo.customer_name || "Work Order",
      status: wo.status,
      id: wo.id,
    });
  });

  vehicleAppointments.forEach((apt) => {
    timelineItems.push({
      type: "appointment",
      date: apt.appointment_date,
      title: `Appointment ${apt.appointment_number}`,
      description: apt.service_type || "Appointment",
      status: apt.status,
      id: apt.id,
    });
  });

  timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
      case "confirmed":
        return "success";
      case "in_progress":
        return "info";
      case "pending":
        return "warning";
      case "cancelled":
        return "danger";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/vehicles/${id}`}>
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Vehicle
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Service History</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.license_plate || vehicle.vin}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Services</p>
                <p className="text-2xl font-bold text-foreground">{vehicleWorkOrders.length}</p>
              </div>
              <Wrench className="w-8 h-8 text-primary dark:text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Appointments</p>
                <p className="text-2xl font-bold text-foreground">{vehicleAppointments.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-green-500 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Mileage</p>
                <p className="text-2xl font-bold text-foreground">
                  {vehicle.current_mileage
                    ? `${vehicle.current_mileage.toLocaleString()} mi`
                    : "-"}
                </p>
              </div>
              <Gauge className="w-8 h-8 text-purple-500 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Spent</p>
                <p className="text-2xl font-bold text-foreground">
                  $
                  {vehicleWorkOrders
                    .reduce((sum, wo) => {
                      const cost = wo.total_cost
                        ? parseFloat(wo.total_cost.toString())
                        : 0;
                      return sum + cost;
                    }, 0)
                    .toFixed(2)}
                </p>
              </div>
              <FileText className="w-8 h-8 text-orange-500 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Work Orders */}
      <Card>
        <CardHeader>
          <CardTitle>Work Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicleWorkOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Total Cost</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleWorkOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-mono text-sm font-medium text-foreground">
                        {wo.work_order_number}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {wo.created_at
                          ? format(new Date(wo.created_at), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(wo.status) as any}>
                          {wo.status?.replace("_", " ") || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{wo.priority || "-"}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {wo.total_cost
                          ? `${formatCurrency(parseFloat(wo.total_cost.toString()))}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/workorders/${wo.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No work orders found for this vehicle.</p>
          )}
        </CardContent>
      </Card>

      {/* Appointments */}
      <Card>
        <CardHeader>
          <CardTitle>Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {vehicleAppointments.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Appointment #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleAppointments.map((apt) => (
                    <TableRow key={apt.id}>
                      <TableCell className="font-mono text-sm font-medium text-foreground">
                        {apt.appointment_number}
                      </TableCell>
                      <TableCell className="text-foreground">
                        {apt.appointment_date
                          ? format(new Date(apt.appointment_date), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-foreground">{apt.appointment_time || "-"}</TableCell>
                      <TableCell className="text-foreground">{apt.service_type || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(apt.status) as any}>
                          {apt.status?.replace("_", " ") || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/appointments/${apt.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No appointments found for this vehicle.</p>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      {timelineItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timelineItems.map((item, index) => (
                <div key={`${item.type}-${item.id}`} className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        item.type === "work_order"
                          ? "bg-orange-100 dark:bg-orange-900/30 text-primary dark:text-primary"
                          : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      }`}
                    >
                      {item.type === "work_order" ? (
                        <Wrench className="w-5 h-5" />
                      ) : (
                        <Calendar className="w-5 h-5" />
                      )}
                    </div>
                    {index < timelineItems.length - 1 && (
                      <div className="w-0.5 h-full bg-border ml-5 -mt-2" style={{ height: "40px" }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant={getStatusVariant(item.status) as any}>
                          {item.status?.replace("_", " ")}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(item.date), "MMM dd, yyyy")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

