"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Clock,
  Car,
  User,
  Phone,
  Mail,
  MapPin,
  Wrench,
  AlertCircle,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Edit,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function AppointmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const appointmentId = parseInt(params.id as string);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const { formatCurrency } = useCurrency();
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const { data: appointment, isLoading } = useQuery({
    queryKey: ["portal", "appointment", appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
    enabled: !!appointmentId,
  });

  const apt = appointment as any; // Type assertion for extended fields

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => appointmentsApi.cancel(appointmentId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "dashboard"] });
      toast({
        title: "Appointment Cancelled",
        description: "Your appointment has been cancelled successfully.",
      });
      setShowCancelDialog(false);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.response?.data?.error || "Failed to cancel appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ date, time }: { date: string; time: string }) =>
      appointmentsApi.reschedule(appointmentId, date, time),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "dashboard"] });
      toast({
        title: "Appointment Rescheduled",
        description: "Your appointment has been rescheduled successfully.",
      });
      setShowRescheduleDialog(false);
      setRescheduleDate("");
      setRescheduleTime("");
    },
    onError: (error: any) => {
      toast({
        title: "Reschedule Failed",
        description: error.response?.data?.error || "Failed to reschedule appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-4" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Appointment not found</p>
        <Link href="/portal/appointments">
          <Button variant="secondary" className="mt-4">
            Back to Appointments
          </Button>
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "warning",
    confirmed: "info",
    in_progress: "info",
    completed: "success",
    cancelled: "secondary",
    no_show: "danger",
    rescheduled: "warning",
  };

  const priorityColors: Record<string, string> = {
    low: "secondary",
    normal: "info",
    high: "warning",
    urgent: "danger",
  };

  const canCancel = ["pending", "confirmed"].includes(appointment.status);
  const canReschedule = ["pending", "confirmed"].includes(appointment.status);
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/portal/appointments">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Appointment #{appointment.appointment_number}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {format(new Date(appointment.appointment_date), "EEEE, MMMM d, yyyy")} at{" "}
              {appointment.appointment_time}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={statusColors[appointment.status] as any}>
            {appointment.status?.replace("_", " ").toUpperCase()}
          </Badge>
          <Badge variant={priorityColors[appointment.priority] as any}>
            {appointment.priority?.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      {(canCancel || canReschedule) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              {canReschedule && (
                <Button
                  variant="secondary"
                  onClick={() => setShowRescheduleDialog(true)}
                  disabled={rescheduleMutation.isPending}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Reschedule
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="secondary"
                  onClick={() => setShowCancelDialog(true)}
                  disabled={cancelMutation.isPending}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancel Appointment
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Appointment Information */}
          <Card>
            <CardHeader>
              <CardTitle>Appointment Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span>Date</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {format(new Date(appointment.appointment_date), "MMMM d, yyyy")}
                  </p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Time</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {appointment.appointment_time}
                  </p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                    <Wrench className="w-4 h-4" />
                    <span>Service Type</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">
                    {appointment.service_type?.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
                    <Clock className="w-4 h-4" />
                    <span>Duration</span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {appointment.estimated_duration || 60} minutes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Info */}
          <Card>
            <CardHeader>
              <CardTitle>Vehicle Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                <Car className="w-8 h-8 text-primary mt-1" />
                <div className="flex-1">
                  <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                    {apt.vehicle_info || apt.vehicle_display || "N/A"}
                  </p>
                  {apt.vehicle_plate && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      License: {apt.vehicle_plate}
                    </p>
                  )}
                </div>
                <Link href={`/portal/vehicles/${appointment.vehicle}`}>
                  <Button variant="secondary" size="sm">
                    View Vehicle
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Customer Concerns */}
          {apt.customer_concerns && (
            <Card>
              <CardHeader>
                <CardTitle>Your Concerns</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {apt.customer_concerns}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Special Instructions */}
          {apt.special_instructions && (
            <Card>
              <CardHeader>
                <CardTitle>Special Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {apt.special_instructions}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Current Status</span>
                  <Badge variant={statusColors[appointment.status] as any}>
                    {appointment.status?.replace("_", " ").toUpperCase()}
                  </Badge>
                </div>
                {apt.confirmed_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Confirmed At</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {format(new Date(apt.confirmed_at), "MMM d, yyyy")}
                    </span>
                  </div>
                )}
                {apt.check_in_time && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Checked In</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {format(new Date(apt.check_in_time), "MMM d, h:mm a")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Estimated Cost */}
          {apt.estimated_cost && (
            <Card>
              <CardHeader>
                <CardTitle>Estimated Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(apt.estimated_cost)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Final cost may vary
                </p>
              </CardContent>
            </Card>
          )}

          {/* Branch Information */}
          {apt.branch_name && (
            <Card>
              <CardHeader>
                <CardTitle>Location</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start space-x-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {apt.branch_name}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
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
          <div className="space-y-4">
            <div>
              <Label htmlFor="cancel-reason">Reason for Cancellation (Optional)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please let us know why you're cancelling..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCancelDialog(false)}>
              Keep Appointment
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate(cancelReason)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
            <DialogDescription>
              Please select a new date and time for your appointment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reschedule-date">New Date</Label>
              <Input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                min={today}
                required
              />
            </div>
            <div>
              <Label htmlFor="reschedule-time">New Time</Label>
              <Input
                id="reschedule-time"
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowRescheduleDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                // Convert time from HH:MM to HH:MM:SS format
                const timeWithSeconds = rescheduleTime ? `${rescheduleTime}:00` : rescheduleTime;
                rescheduleMutation.mutate({ date: rescheduleDate, time: timeWithSeconds });
              }}
              disabled={rescheduleMutation.isPending || !rescheduleDate || !rescheduleTime}
            >
              {rescheduleMutation.isPending ? "Rescheduling..." : "Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

