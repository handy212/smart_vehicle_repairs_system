"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Car, Calendar, Wrench, DollarSign, Package, TrendingUp } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Link from "next/link";
import { format } from "date-fns";

export default function DashboardPage() {
  // Fetch data from APIs
  const { data: customersData } = useQuery({
    queryKey: ["customers", "dashboard"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "dashboard"],
    queryFn: () => vehiclesApi.list({ page: 1 }),
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "dashboard"],
    queryFn: () => appointmentsApi.list({ page: 1 }),
  });

  const { data: workordersData } = useQuery({
    queryKey: ["workorders", "dashboard"],
    queryFn: () => workordersApi.list({ page: 1 }),
  });

  const { data: todayAppointments } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => appointmentsApi.today(),
  });

  const { data: activeWorkOrders } = useQuery({
    queryKey: ["workorders", "active"],
    queryFn: () => workordersApi.active(),
  });

  const isLoading = !customersData || !vehiclesData || !appointmentsData || !workordersData;

  // Calculate stats
  const stats = {
    total_customers: customersData?.count || 0,
    total_vehicles: vehiclesData?.count || 0,
    total_appointments: appointmentsData?.count || 0,
    active_work_orders: activeWorkOrders?.length || 0,
    today_appointments: todayAppointments?.length || 0,
    monthly_revenue: 0, // Will be calculated from billing API later
    low_stock_items_count: 0, // Will be calculated from inventory API later
  };

  // Prepare chart data
  const workOrderStatusData = workordersData?.results?.reduce((acc: any[], wo: any) => {
    const existing = acc.find((item) => item.status === wo.status);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ status: wo.status.replace("_", " "), count: 1 });
    }
    return acc;
  }, []) || [];

  const appointmentStatusData = appointmentsData?.results?.reduce((acc: any[], apt: any) => {
    const existing = acc.find((item) => item.status === apt.status);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ status: apt.status.replace("_", " "), count: 1 });
    }
    return acc;
  }, []) || [];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Customers",
      value: stats?.total_customers || 0,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: "Total Vehicles",
      value: stats?.total_vehicles || 0,
      icon: Car,
      color: "bg-green-500",
    },
    {
      title: "Today's Appointments",
      value: stats?.today_appointments || 0,
      icon: Calendar,
      color: "bg-yellow-500",
    },
    {
      title: "Active Work Orders",
      value: stats?.active_work_orders || 0,
      icon: Wrench,
      color: "bg-purple-500",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats?.monthly_revenue?.toLocaleString() || 0}`,
      icon: DollarSign,
      color: "bg-emerald-500",
    },
    {
      title: "Low Stock Items",
      value: stats?.low_stock_items_count || 0,
      icon: Package,
      color: "bg-red-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Welcome back! Here's what's happening today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.color} p-2 rounded-lg`}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Work Orders by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Work Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={workOrderStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {workOrderStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500">
                No work order data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Appointments by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Appointments by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {appointmentStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={appointmentStatusData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-gray-500">
                No appointment data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Today's Appointments</CardTitle>
            <Link href="/appointments" className="text-sm text-blue-600 hover:text-blue-800">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {todayAppointments && todayAppointments.length > 0 ? (
              <div className="space-y-3">
                {todayAppointments.slice(0, 5).map((apt: any) => (
                  <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{apt.customer_name || "N/A"}</p>
                      <p className="text-xs text-gray-500">
                        {apt.vehicle_info || "N/A"} • {apt.appointment_time}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      apt.status === "confirmed" ? "bg-green-100 text-green-800" :
                      apt.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No appointments scheduled for today</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Work Orders</CardTitle>
            <Link href="/workorders" className="text-sm text-blue-600 hover:text-blue-800">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            {activeWorkOrders && activeWorkOrders.length > 0 ? (
              <div className="space-y-3">
                {activeWorkOrders.slice(0, 5).map((wo: any) => (
                  <div key={wo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">{wo.work_order_number}</p>
                      <p className="text-xs text-gray-500">
                        {wo.customer_name || "N/A"} • {wo.vehicle_info || "N/A"}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      wo.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                      wo.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {wo.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No active work orders</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

