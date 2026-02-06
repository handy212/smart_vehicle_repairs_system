"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Edit, Calendar, Clock, User, Car, FileText, AlertCircle, CheckCircle, XCircle, CheckCheck } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function AppointmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appointmentId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const { data: appointment, isLoading, error } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
  });

  const confirmMutation = useMutation({
    mutationFn: () => appointmentsApi.confirm(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment confirmed successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to confirm appointment",
        variant: "destructive",
      });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: () => appointmentsApi.checkIn(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Customer checked in successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to check in customer",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => appointmentsApi.complete(appointmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment marked as completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to complete appointment",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => appointmentsApi.cancel(appointmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment cancelled successfully" });
      setShowCancelDialog(false);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to cancel appointment",
        variant: "destructive",
      });
    },
  });

  const handleCancel = () => {
    if (cancelReason.trim()) {
      cancelMutation.mutate(cancelReason);
    } else {
      cancelMutation.mutate("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading appointment. Please try again.</p>
          </CardContent>
        </Card>
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
        return "info";
      case "cancelled":
        return "danger";
      default:
        return "default";
    }
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/appointments" className="hover:text-primary transition-colors">Appointments</Link>
            <span>/</span>
            <span className="text-foreground font-medium">#{appointment.appointment_number}</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Appointment Details</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="h-9 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Back
          </Button>
          <PermissionGuard permission="edit_appointments">
            <Link href={`/appointments/${appointmentId}/edit`}>
              <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                <Edit className="w-3.5 h-3.5 mr-2" />
                Edit Appointment
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Status and Priority Badges */}
      <div className="flex items-center space-x-2">
        <Badge variant={getStatusVariant(appointment.status) as any} className="text-xs px-2.5 py-0.5 font-medium border shadow-none">
          {appointment.status?.replace("_", " ") || appointment.status}
        </Badge>
        <Badge variant="outline" className="text-xs px-2.5 py-0.5 font-medium border shadow-none bg-transparent">
          {appointment.priority} Priority
        </Badge>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Appointment Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Appointment Details */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p className="text-gray-900">
                    {appointment.appointment_date
                      ? format(new Date(appointment.appointment_date), "EEEE, MMMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Time</p>
                  <p className="text-gray-900">{appointment.appointment_time || "-"}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Service Type</p>
                <p className="text-gray-900 capitalize">
                  {appointment.service_type?.replace("_", " ") || appointment.service_type || "-"}
                </p>
              </div>
              {appointment.estimated_duration && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Estimated Duration</p>
                  <p className="text-gray-900">{appointment.estimated_duration} minutes</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer & Vehicle */}
          <Card>
            <CardHeader>
              <CardTitle>Customer & Vehicle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start space-x-3">
                <User className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Customer</p>
                  {appointment.customer ? (
                    <Link
                      href={`/customers/${typeof appointment.customer === 'object' && appointment.customer !== null ? appointment.customer.id : appointment.customer}`}
                      className="text-primary hover:text-orange-800 font-medium"
                    >
                      {appointment.customer_name || "View Customer"}
                    </Link>
                  ) : (
                    <p className="text-gray-900">{appointment.customer_name || "-"}</p>
                  )}
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Car className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500">Vehicle</p>
                  {appointment.vehicle ? (
                    <Link
                      href={`/vehicles/${typeof appointment.vehicle === 'object' && appointment.vehicle !== null ? appointment.vehicle.id : appointment.vehicle}`}
                      className="text-primary hover:text-orange-800 font-medium"
                    >
                      {appointment.vehicle_info || "View Vehicle"}
                    </Link>
                  ) : (
                    <p className="text-gray-900">{appointment.vehicle_info || "-"}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {appointment.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 whitespace-pre-wrap">{appointment.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {appointment.status === "pending" && (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {confirmMutation.isPending ? "Confirming..." : "Confirm Appointment"}
                </Button>
              )}
              {(appointment.status === "confirmed" || appointment.status === "pending") && (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={() => checkInMutation.mutate()}
                  disabled={checkInMutation.isPending}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {checkInMutation.isPending ? "Checking in..." : "Check In Customer"}
                </Button>
              )}
              {appointment.status === "in_progress" && (
                <Button
                  className="w-full"
                  variant="default"
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {completeMutation.isPending ? "Completing..." : "Complete Appointment"}
                </Button>
              )}
              {appointment.status !== "completed" && appointment.status !== "cancelled" && (
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelMutation.isPending}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel Appointment
                </Button>
              )}
              <Link href={`/workorders/new?appointment=${appointmentId}`} className="block">
                <Button variant="secondary" className="w-full">
                  <FileText className="w-4 h-4 mr-2" />
                  Create Work Order
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Appointment Info */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Appointment Number</p>
                <p className="text-sm font-mono">{appointment.appointment_number}</p>
              </div>
              {appointment.created_at && (
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm">
                    {format(new Date(appointment.created_at), "MMM dd, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Appointment</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this appointment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Cancellation Reason (Optional)
              </label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCancelDialog(false);
                setCancelReason("");
              }}
              disabled={cancelMutation.isPending}
            >
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

