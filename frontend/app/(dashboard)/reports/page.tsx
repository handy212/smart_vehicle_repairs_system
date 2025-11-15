"use client";

import { useQuery } from "@tanstack/react-query";
import { reportingApi } from "@/lib/api/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Download, Calendar, TrendingUp, DollarSign, Users, Car, Package, Wrench, AlertCircle } from "lucide-react";
import { useState } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [activeTab, setActiveTab] = useState("financial");

  // Dashboard Overview
  const { data: dashboardData } = useQuery({
    queryKey: ["reporting", "dashboard"],
    queryFn: () => reportingApi.dashboard(),
  });

  // Financial Reports
  const { data: revenueData } = useQuery({
    queryKey: ["reporting", "revenue", startDate, endDate, period],
    queryFn: () => reportingApi.revenue({ start_date: startDate, end_date: endDate, period }),
  });

  const { data: profitMarginData } = useQuery({
    queryKey: ["reporting", "profit-margin", startDate, endDate],
    queryFn: () => reportingApi.profitMargin({ start_date: startDate, end_date: endDate }),
  });

  // Operational Reports
  const { data: workOrderStats } = useQuery({
    queryKey: ["reporting", "work-orders", startDate, endDate],
    queryFn: () => reportingApi.workOrderStatistics({ start_date: startDate, end_date: endDate }),
  });

  const { data: technicianPerf } = useQuery({
    queryKey: ["reporting", "technicians", startDate, endDate],
    queryFn: () => reportingApi.technicianPerformance({ start_date: startDate, end_date: endDate }),
  });

  const { data: appointmentStats } = useQuery({
    queryKey: ["reporting", "appointments", startDate, endDate],
    queryFn: () => reportingApi.appointmentStatistics({ start_date: startDate, end_date: endDate }),
  });

  // Inventory Reports
  const { data: inventoryValuation } = useQuery({
    queryKey: ["reporting", "inventory", "valuation"],
    queryFn: () => reportingApi.inventoryValuation(),
  });

  const { data: lowStockData } = useQuery({
    queryKey: ["reporting", "inventory", "low-stock"],
    queryFn: () => reportingApi.lowStock(),
  });

  // Customer Reports
  const { data: customerStats } = useQuery({
    queryKey: ["reporting", "customers", startDate, endDate],
    queryFn: () => reportingApi.customerStatistics({ start_date: startDate, end_date: endDate }),
  });

  // Vehicle Reports
  const { data: vehicleStats } = useQuery({
    queryKey: ["reporting", "vehicles"],
    queryFn: () => reportingApi.vehicleStatistics(),
  });

  const { data: serviceDueData } = useQuery({
    queryKey: ["reporting", "vehicles", "service-due"],
    queryFn: () => reportingApi.serviceDue(),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Comprehensive business intelligence and reporting
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-40"
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-40"
          />
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Dashboard Overview */}
      {dashboardData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Today's Revenue</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${dashboardData.today.revenue.toFixed(2)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">This Week</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${dashboardData.week.revenue.toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${dashboardData.month.revenue.toFixed(2)}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Overdue Invoices</p>
                  <p className="text-2xl font-bold text-red-600">
                    {dashboardData.alerts?.overdue_invoices?.count || 0}
                  </p>
                  <p className="text-xs text-gray-500">
                    ${(dashboardData.alerts?.overdue_invoices?.total || 0).toFixed(2)}
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="operational">Operational</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
        </TabsList>

        {/* Financial Reports */}
        <TabsContent value="financial" className="space-y-6">
          {revenueData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">${revenueData.summary.total_invoiced.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">
                      ${revenueData.summary.total_paid.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-red-600">
                      ${revenueData.summary.total_outstanding.toFixed(2)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Payment Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      {revenueData.summary.payment_rate.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Period</CardTitle>
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant={period === "daily" ? "default" : "outline"}
                        onClick={() => setPeriod("daily")}
                      >
                        Daily
                      </Button>
                      <Button
                        size="sm"
                        variant={period === "weekly" ? "default" : "outline"}
                        onClick={() => setPeriod("weekly")}
                      >
                        Weekly
                      </Button>
                      <Button
                        size="sm"
                        variant={period === "monthly" ? "default" : "outline"}
                        onClick={() => setPeriod("monthly")}
                      >
                        Monthly
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {revenueData.revenue_by_period.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={revenueData.revenue_by_period}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="period"
                            tickFormatter={(value) => format(new Date(value), "MMM dd")}
                          />
                          <YAxis />
                          <Tooltip
                            formatter={(value: number) => `$${value.toFixed(2)}`}
                            labelFormatter={(value) => format(new Date(value), "MMM dd, yyyy")}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            stroke="#3B82F6"
                            name="Revenue"
                            strokeWidth={2}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Payment Method</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {revenueData.revenue_by_payment_method.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={revenueData.revenue_by_payment_method}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ method, percent }) =>
                              `${method}: ${percent ? (percent * 100).toFixed(0) : 0}%`
                            }
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="total"
                          >
                            {revenueData.revenue_by_payment_method.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[300px] text-gray-500">
                        No data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Revenue by Technician</CardTitle>
                </CardHeader>
                <CardContent>
                  {revenueData.revenue_by_technician.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={revenueData.revenue_by_technician}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="technician" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#10B981" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {profitMarginData && (
            <Card>
              <CardHeader>
                <CardTitle>Profit Margin Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold">${profitMarginData.revenue.total.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Costs</p>
                    <p className="text-2xl font-bold text-red-600">
                      ${profitMarginData.costs.parts.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Profit Margin</p>
                    <p className="text-2xl font-bold text-green-600">
                      {profitMarginData.profit.profit_margin.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[
                    { name: "Labor", value: profitMarginData.revenue.labor },
                    { name: "Parts", value: profitMarginData.revenue.parts },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Bar dataKey="value" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Operational Reports */}
        <TabsContent value="operational" className="space-y-6">
          {workOrderStats && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Work Orders by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {workOrderStats.by_status && workOrderStats.by_status.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={workOrderStats.by_status}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry: any) => {
                            const percent = entry.percent || 0;
                            return `${entry.status}: ${(percent * 100).toFixed(0)}%`;
                          }}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {workOrderStats.by_status.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] text-gray-500">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Work Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Work Orders</p>
                    <p className="text-2xl font-bold">{workOrderStats.summary?.total_work_orders || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {workOrderStats.summary?.completed || 0}
                    </p>
                  </div>
                  {workOrderStats.summary?.average_completion_hours && (
                    <div>
                      <p className="text-sm text-gray-600">Avg Completion Time</p>
                      <p className="text-2xl font-bold">
                        {workOrderStats.summary.average_completion_hours.toFixed(1)} hours
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {technicianPerf && technicianPerf.technicians && (
            <Card>
              <CardHeader>
                <CardTitle>Technician Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Technician</TableHead>
                        <TableHead>Work Orders</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Avg Time (hrs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {technicianPerf.technicians.map((tech: any) => (
                        <TableRow key={tech.technician.id}>
                          <TableCell className="font-medium">{tech.technician.name}</TableCell>
                          <TableCell>{tech.metrics.total_work_orders || 0}</TableCell>
                          <TableCell>{tech.metrics.completed || 0}</TableCell>
                          <TableCell>${tech.metrics.revenue?.toFixed(2) || "0.00"}</TableCell>
                          <TableCell>
                            {tech.metrics.average_completion_hours?.toFixed(1) || "N/A"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {appointmentStats && (
            <Card>
              <CardHeader>
                <CardTitle>Appointment Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">Total Appointments</p>
                    <p className="text-2xl font-bold">{appointmentStats.summary?.total_appointments || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">No-Show Rate</p>
                    <p className="text-2xl font-bold text-red-600">
                      {appointmentStats.summary?.no_show_rate?.toFixed(1) || 0}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-green-600">
                      {appointmentStats.summary?.completed || 0}
                    </p>
                  </div>
                </div>
                {appointmentStats.by_status && appointmentStats.by_status.length > 0 && (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={appointmentStats.by_status}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inventory Reports */}
        <TabsContent value="inventory" className="space-y-6">
          {inventoryValuation && (
            <Card>
              <CardHeader>
                <CardTitle>Inventory Valuation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <p className="text-sm text-gray-600">Total Inventory Value</p>
                  <p className="text-3xl font-bold">
                    ${(inventoryValuation.summary?.total_value || inventoryValuation.total_value || 0).toFixed(2)}
                  </p>
                </div>
                {inventoryValuation.by_category && inventoryValuation.by_category.length > 0 && (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={inventoryValuation.by_category}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                      <Legend />
                      <Bar dataKey="value" fill="#8B5CF6" name="Value" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {lowStockData && (
            <Card>
              <CardHeader>
                <CardTitle>Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent>
                {lowStockData.items && lowStockData.items.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Current Stock</TableHead>
                          <TableHead>Reorder Point</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lowStockData.items.map((item) => (
                          <TableRow key={item.part.id}>
                            <TableCell className="font-medium">{item.part.name}</TableCell>
                            <TableCell>{item.part.category || "N/A"}</TableCell>
                            <TableCell>{item.stock.current}</TableCell>
                            <TableCell>{item.stock.reorder_point}</TableCell>
                            <TableCell>
                              <span className={item.is_critical ? "text-red-600 font-medium" : "text-orange-600 font-medium"}>
                                {item.is_critical ? "Critical" : "Low Stock"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-gray-500">No low stock items</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Customer Reports */}
        <TabsContent value="customers" className="space-y-6">
          {customerStats && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{customerStats.total_customers || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">New Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">
                      {customerStats.new_customers || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{customerStats.active_customers || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Top Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{customerStats.top_customers?.length || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {customerStats.top_customers && customerStats.top_customers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Customers by Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Revenue</TableHead>
                            <TableHead>Work Orders</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerStats.top_customers.map((customer: any) => (
                            <TableRow key={customer.id}>
                              <TableCell className="font-medium">{customer.name}</TableCell>
                              <TableCell>${customer.revenue?.toFixed(2) || "0.00"}</TableCell>
                              <TableCell>{customer.work_orders || 0}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Vehicle Reports */}
        <TabsContent value="vehicles" className="space-y-6">
          {vehicleStats && (
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <p className="text-sm text-gray-600">Total Vehicles</p>
                    <p className="text-2xl font-bold">{vehicleStats.total_vehicles || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Average Age</p>
                    <p className="text-2xl font-bold">
                      {vehicleStats.average_age ? `${vehicleStats.average_age.toFixed(1)} years` : "N/A"}
                    </p>
                  </div>
                </div>
                {vehicleStats.by_make && vehicleStats.by_make.length > 0 && (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={vehicleStats.by_make}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="make" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#06B6D4" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {serviceDueData && (
            <Card>
              <CardHeader>
                <CardTitle>Service Due Report</CardTitle>
              </CardHeader>
              <CardContent>
                {serviceDueData.vehicles && serviceDueData.vehicles.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle</TableHead>
                          <TableHead>Last Service</TableHead>
                          <TableHead>Next Service Due</TableHead>
                          <TableHead>Mileage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {serviceDueData.vehicles.map((vehicle: any) => (
                          <TableRow key={vehicle.id}>
                            <TableCell className="font-medium">
                              {vehicle.vehicle_info || 
                               `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.license_plate || ""}`.trim() || 
                               `Vehicle #${vehicle.id}`}
                            </TableCell>
                            <TableCell>
                              {vehicle.last_service_date
                                ? format(new Date(vehicle.last_service_date), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              {vehicle.next_service_due
                                ? format(new Date(vehicle.next_service_due), "MMM dd, yyyy")
                                : "N/A"}
                            </TableCell>
                            <TableCell>
                              {(vehicle.mileage || vehicle.odometer_reading)?.toLocaleString() || "N/A"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-8 text-gray-500">No vehicles due for service</p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
