"use client";

import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/lib/api/portal";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Car, 
  Calendar, 
  FileText, 
  DollarSign, 
  Clock,
  ArrowRight,
  AlertCircle,
  PlusCircle,
  Receipt,
  TrendingUp
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function PortalHomePage() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["portal", "dashboard"],
    queryFn: () => portalApi.dashboard(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Unable to load dashboard data</p>
      </div>
    );
  }

  const { stats, recent_appointments, recent_invoices, vehicles } = dashboard;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Welcome{user ? `, ${user.first_name || "Customer"}` : ""}!
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Here's an overview of your account
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Vehicles
            </CardTitle>
            <Car className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.total_vehicles}
            </div>
            <Link
              href="/portal/vehicles"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
            >
              View all →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Upcoming Appointments
            </CardTitle>
            <Calendar className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.upcoming_appointments_count}
            </div>
            <Link
              href="/portal/appointments"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
            >
              View all →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Pending Invoices
            </CardTitle>
            <FileText className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.pending_invoices_count}
            </div>
            <Link
              href="/portal/invoices"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
            >
              View all →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Spent
            </CardTitle>
            <DollarSign className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ${parseFloat(String(stats.total_spent || 0)).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Appointments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Appointments</CardTitle>
            <Link
              href="/portal/appointments"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent_appointments.length > 0 ? (
              <div className="space-y-3">
                {recent_appointments.map((apt: any) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {apt.vehicle_info || "N/A"}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {format(new Date(apt.appointment_date), "MMM d, yyyy")} at{" "}
                        {apt.appointment_time}
                      </p>
                    </div>
                    <Badge
                      variant={
                        apt.status === "confirmed"
                          ? "success"
                          : apt.status === "pending"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {apt.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No recent appointments
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Invoices</CardTitle>
            <Link
              href="/portal/invoices"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center"
            >
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent_invoices.length > 0 ? (
              <div className="space-y-3">
                {recent_invoices.map((inv: any) => (
                  <Link
                    key={inv.id}
                    href={`/portal/invoices/${inv.id}`}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        Invoice #{inv.invoice_number}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {format(new Date(inv.invoice_date), "MMM d, yyyy")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        ${parseFloat(String(inv.total || 0)).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <Badge
                        variant={
                          inv.status === "paid"
                            ? "success"
                            : inv.status === "pending"
                            ? "warning"
                            : "secondary"
                        }
                        className="mt-1"
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No recent invoices
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link
              href="/portal/book"
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 rounded-lg hover:shadow-md transition-all border border-blue-200 dark:border-blue-800"
            >
              <div className="p-3 bg-blue-500 rounded-full mb-3">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-center">Book Appointment</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">Schedule a service</p>
            </Link>
            <Link
              href="/portal/vehicles/new"
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 rounded-lg hover:shadow-md transition-all border border-green-200 dark:border-green-800"
            >
              <div className="p-3 bg-green-500 rounded-full mb-3">
                <PlusCircle className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-center">Add Vehicle</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">Register new vehicle</p>
            </Link>
            <Link
              href="/portal/invoices"
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/10 rounded-lg hover:shadow-md transition-all border border-yellow-200 dark:border-yellow-800"
            >
              <div className="p-3 bg-yellow-500 rounded-full mb-3">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-center">View Invoices</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">Check your bills</p>
            </Link>
            <Link
              href="/portal/history"
              className="flex flex-col items-center justify-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 rounded-lg hover:shadow-md transition-all border border-purple-200 dark:border-purple-800"
            >
              <div className="p-3 bg-purple-500 rounded-full mb-3">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-center">Service History</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">View past services</p>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Appointments Widget */}
      {stats.upcoming_appointments_count > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>Upcoming Appointments</span>
              </CardTitle>
              <Link href="/portal/appointments">
                <Button variant="outline" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You have <strong>{stats.upcoming_appointments_count}</strong> upcoming appointment{stats.upcoming_appointments_count !== 1 ? "s" : ""}. 
              {" "}
              <Link href="/portal/appointments" className="text-blue-600 dark:text-blue-400 hover:underline">
                View details →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pending Payments Widget */}
      {stats.pending_invoices_count > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                <span>Action Required</span>
              </CardTitle>
              <Link href="/portal/invoices">
                <Button variant="outline" size="sm">
                  View Invoices
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You have <strong>{stats.pending_invoices_count}</strong> pending invoice{stats.pending_invoices_count !== 1 ? "s" : ""} that require your attention.
              {" "}
              <Link href="/portal/invoices" className="text-yellow-600 dark:text-yellow-400 hover:underline">
                Pay now →
              </Link>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


