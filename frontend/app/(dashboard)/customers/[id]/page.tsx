"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { customersApi } from "@/lib/api/customers";
import { billingApi } from "@/lib/api/billing";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, DollarSign, Package, Car, MessageSquare, FileText, Plus, Receipt, ClipboardList, Wrench } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/useToast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const noteSchema = z.object({
  note: z.string().min(1, "Note is required"),
  note_type: z.enum(["phone_call", "email", "meeting", "internal", "complaint"]),
  is_important: z.boolean().optional(),
});

type NoteFormData = z.infer<typeof noteSchema>;

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = parseInt(params.id as string);
  const [activeTab, setActiveTab] = useState("overview");
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  const { data: stats } = useQuery({
    queryKey: ["customer", customerId, "stats"],
    queryFn: () => customersApi.stats(customerId),
    enabled: !!customerId,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["customer", customerId, "vehicles"],
    queryFn: () => customersApi.vehicles(customerId),
    enabled: !!customerId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["customer", customerId, "notes"],
    queryFn: () => customersApi.notes.list(customerId),
    enabled: !!customerId,
  });

  // Fetch customer-related invoices, estimates, work orders, and appointments
  const { data: invoicesData } = useQuery({
    queryKey: ["invoices", "customer", customerId],
    queryFn: () => billingApi.invoices.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: estimatesData } = useQuery({
    queryKey: ["estimates", "customer", customerId],
    queryFn: () => billingApi.estimates.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "customer", customerId],
    queryFn: () => workordersApi.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "customer", customerId],
    queryFn: () => appointmentsApi.list({ customer: customerId }),
    enabled: !!customerId,
  });

  const invoices = invoicesData?.results || [];
  const estimates = estimatesData?.results || [];
  const workOrders = workOrdersData?.results || [];
  const appointments = appointmentsData?.results || [];

  const createNoteMutation = useMutation({
    mutationFn: (data: NoteFormData) => customersApi.notes.create(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", customerId, "notes"] });
      toast({ title: "Success", description: "Note added successfully" });
      setIsNoteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to add note",
        variant: "destructive",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<NoteFormData>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      note_type: "internal",
      is_important: false,
    },
  });

  const onSubmitNote = async (data: NoteFormData) => {
    await createNoteMutation.mutateAsync(data);
    reset();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading customer. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "inactive":
        return "secondary";
      case "suspended":
        return "danger";
      default:
        return "default";
    }
  };

  const getNoteTypeLabel = (type: string) => {
    switch (type) {
      case "phone_call":
        return "Phone Call";
      case "email":
        return "Email";
      case "meeting":
        return "Meeting";
      case "internal":
        return "Internal";
      case "complaint":
        return "Complaint";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {customer.user?.first_name} {customer.user?.last_name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Customer #{customer.customer_number}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getStatusVariant(customer.status) as any} className="text-sm px-3 py-1">
            {customer.status}
          </Badge>
          <Link href={`/customers/${customerId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="history">
            History ({invoices.length + estimates.length + workOrders.length + appointments.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Customer Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Email</p>
                      <p className="text-gray-900">{customer.user?.email || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Phone</p>
                      <p className="text-gray-900">{customer.user?.phone || "-"}</p>
                    </div>
                  </div>
                  {customer.user?.address && (
                    <div className="flex items-start space-x-3">
                      <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Address</p>
                        <p className="text-gray-900">{customer.user.address}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Business Information */}
              {customer.customer_type !== "individual" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Business Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Company Name</p>
                      <p className="text-gray-900">{customer.company_name || "-"}</p>
                    </div>
                    {customer.business_type && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Business Type</p>
                        <p className="text-gray-900">{customer.business_type}</p>
                      </div>
                    )}
                    {customer.tax_id && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Tax ID</p>
                        <p className="text-gray-900">{customer.tax_id}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Account Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Customer Type</p>
                      <p className="text-gray-900 capitalize">{customer.customer_type || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Payment Terms</p>
                      <p className="text-gray-900">{customer.payment_terms?.replace("_", " ") || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Current Balance</p>
                      <p className="text-gray-900 font-semibold">
                        ${parseFloat(customer.current_balance || "0").toFixed(2)}
                      </p>
                    </div>
                    {customer.loyalty_points !== undefined && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">Loyalty Points</p>
                        <p className="text-gray-900">{customer.loyalty_points}</p>
                      </div>
                    )}
                  </div>
                  {customer.customer_since && (
                    <div className="flex items-start space-x-3">
                      <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Customer Since</p>
                        <p className="text-gray-900">
                          {format(new Date(customer.customer_since), "MMMM dd, yyyy")}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Stats & Actions */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Total Vehicles</span>
                    <span className="text-lg font-semibold">{vehicles.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Total Visits</span>
                    <span className="text-lg font-semibold">{stats?.total_visits || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Total Spent</span>
                    <span className="text-lg font-semibold">
                      ${parseFloat(String(stats?.total_spent || 0)).toFixed(2)}
                    </span>
                  </div>
                  {stats?.last_visit_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Last Visit</span>
                      <span className="text-sm font-medium">
                        {format(new Date(stats.last_visit_date), "MMM dd, yyyy")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link href={`/vehicles/new?customer=${customerId}`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Package className="w-4 h-4 mr-2" />
                      Add Vehicle
                    </Button>
                  </Link>
                  <Link href={`/appointments/new?customer=${customerId}`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Appointment
                    </Button>
                  </Link>
                  <Link href={`/workorders/new?customer=${customerId}`} className="block">
                    <Button variant="outline" className="w-full justify-start">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Create Work Order
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Vehicles Tab */}
        <TabsContent value="vehicles" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Vehicles ({vehicles.length})</CardTitle>
                <Link href={`/vehicles/new?customer=${customerId}`}>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vehicle
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {vehicles.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Make/Model</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>VIN</TableHead>
                      <TableHead>License Plate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicles.map((vehicle: any) => (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">
                          {vehicle.make} {vehicle.model}
                        </TableCell>
                        <TableCell>{vehicle.year}</TableCell>
                        <TableCell className="font-mono text-sm">{vehicle.vin}</TableCell>
                        <TableCell>{vehicle.license_plate || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={vehicle.status === "active" ? "success" : "secondary"}>
                            {vehicle.status?.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/vehicles/${vehicle.id}`}>
                            <Button variant="ghost" size="sm">
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <Car className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No vehicles registered for this customer.</p>
                  <Link href={`/vehicles/new?customer=${customerId}`}>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Add First Vehicle
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-6">
          <div className="space-y-6">
            {/* Invoices */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Receipt className="w-5 h-5" />
                    <span>Invoices ({invoices.length})</span>
                  </CardTitle>
                  <Link href={`/billing/invoices/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Invoice
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {invoices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Balance</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice: any) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {invoice.invoice_number}
                          </TableCell>
                          <TableCell>
                            {invoice.invoice_date
                              ? format(new Date(invoice.invoice_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {invoice.due_date
                              ? format(new Date(invoice.due_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                invoice.status === "paid"
                                  ? "success"
                                  : invoice.status === "overdue"
                                  ? "danger"
                                  : invoice.status === "partial"
                                  ? "warning"
                                  : "secondary"
                              }
                            >
                              {invoice.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(invoice.total || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(invoice.balance_due || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/billing/invoices/${invoice.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No invoices found for this customer.</p>
                    <Link href={`/billing/invoices/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Invoice
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Estimates */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <ClipboardList className="w-5 h-5" />
                    <span>Estimates ({estimates.length})</span>
                  </CardTitle>
                  <Link href={`/billing/estimates/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Estimate
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {estimates.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estimate #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Valid Until</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimates.map((estimate: any) => (
                        <TableRow key={estimate.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {estimate.estimate_number}
                          </TableCell>
                          <TableCell>
                            {estimate.estimate_date
                              ? format(new Date(estimate.estimate_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {estimate.valid_until
                              ? format(new Date(estimate.valid_until), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                estimate.status === "approved"
                                  ? "success"
                                  : estimate.status === "declined"
                                  ? "danger"
                                  : estimate.status === "expired"
                                  ? "secondary"
                                  : "warning"
                              }
                            >
                              {estimate.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${parseFloat(String(estimate.total || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Link href={`/billing/estimates/${estimate.id}`}>
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8">
                    <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No estimates found for this customer.</p>
                    <Link href={`/billing/estimates/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Estimate
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Work Orders */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Wrench className="w-5 h-5" />
                    <span>Work Orders ({workOrders.length})</span>
                  </CardTitle>
                  <Link href={`/workorders/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Work Order
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {workOrders.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Work Order #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workOrders.map((wo: any) => (
                        <TableRow key={wo.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {wo.work_order_number}
                          </TableCell>
                          <TableCell>
                            {wo.created_at
                              ? format(new Date(wo.created_at), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>{wo.vehicle_info || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                wo.status === "completed"
                                  ? "success"
                                  : wo.status === "in_progress"
                                  ? "info"
                                  : wo.status === "cancelled"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {wo.status?.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{wo.priority || "-"}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {wo.total_cost
                              ? `$${parseFloat(String(wo.total_cost)).toFixed(2)}`
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
                ) : (
                  <div className="text-center py-8">
                    <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No work orders found for this customer.</p>
                    <Link href={`/workorders/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Work Order
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Appointments */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5" />
                    <span>Appointments ({appointments.length})</span>
                  </CardTitle>
                  <Link href={`/appointments/new?customer=${customerId}`}>
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Appointment
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {appointments.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Appointment #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Vehicle</TableHead>
                        <TableHead>Service Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {appointments.map((apt: any) => (
                        <TableRow key={apt.id}>
                          <TableCell className="font-mono text-sm font-medium">
                            {apt.appointment_number}
                          </TableCell>
                          <TableCell>
                            {apt.appointment_date
                              ? format(new Date(apt.appointment_date), "MMM dd, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>{apt.appointment_time || "-"}</TableCell>
                          <TableCell>{apt.vehicle_info || "-"}</TableCell>
                          <TableCell>{apt.service_type || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                apt.status === "completed"
                                  ? "success"
                                  : apt.status === "confirmed"
                                  ? "info"
                                  : apt.status === "cancelled"
                                  ? "danger"
                                  : "warning"
                              }
                            >
                              {apt.status?.replace("_", " ")}
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
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No appointments found for this customer.</p>
                    <Link href={`/appointments/new?customer=${customerId}`}>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Schedule First Appointment
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Notes ({notes.length})</CardTitle>
                <Button size="sm" onClick={() => setIsNoteDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {notes.length > 0 ? (
                <div className="space-y-4">
                  {notes.map((note: any) => (
                    <div
                      key={note.id}
                      className={`p-4 rounded-lg border ${
                        note.is_important ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary">{getNoteTypeLabel(note.note_type)}</Badge>
                          {note.is_important && (
                            <Badge variant="danger">Important</Badge>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                      <p className="text-gray-900 whitespace-pre-wrap">{note.note}</p>
                      {note.created_by_name && (
                        <p className="text-xs text-gray-500 mt-2">
                          Added by {note.created_by_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No notes for this customer.</p>
                  <Button onClick={() => setIsNoteDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Note
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmitNote)} className="px-6 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="note_type" className="block mb-2">
                  Note Type *
                </Label>
                <Select id="note_type" {...register("note_type")} className="w-full">
                  <option value="internal">Internal</option>
                  <option value="phone_call">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="complaint">Complaint</option>
                </Select>
                {errors.note_type && (
                  <p className="text-red-500 text-xs mt-1">{errors.note_type.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="note" className="block mb-2">
                  Note *
                </Label>
                <Textarea
                  id="note"
                  {...register("note")}
                  rows={6}
                  className="w-full"
                  placeholder="Enter your note here..."
                />
                {errors.note && (
                  <p className="text-red-500 text-xs mt-1">{errors.note.message}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_important"
                  {...register("is_important")}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="is_important" className="cursor-pointer">
                  Mark as Important
                </Label>
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit(onSubmitNote)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Adding..." : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
