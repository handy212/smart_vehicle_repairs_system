"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { roadsideApi, RoadsideRequest } from "@/lib/api/roadside";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Wrench,
  MapPin,
  Clock,
  Phone,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  User,
  Navigation,
  Star,
  Send,
} from "lucide-react";
import dynamic from "next/dynamic";

const RoadsideMap = dynamic(() => import("@/components/roadside/RoadsideMap"), {
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
});
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function RoadsideRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requestId = parseInt(params.id as string);
  const { formatCurrency } = useCurrency();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState(5);

  const { data: request, isLoading } = useQuery({
    queryKey: ["portal", "roadside", requestId],
    queryFn: () => roadsideApi.get(requestId),
    enabled: !!requestId,
  });

  const cancelMutation = useMutation({
    mutationFn: () => roadsideApi.cancel(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "roadside"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "roadside", requestId] });
      toast({
        title: "Request Cancelled",
        description: "Your roadside assistance request has been cancelled.",
      });
      setShowCancelDialog(false);
      router.push("/portal/roadside");
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation Failed",
        description: error.response?.data?.error || "Failed to cancel request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (data: { rating: number; customer_feedback?: string }) => roadsideApi.rate(requestId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "roadside", requestId] });
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.response?.data?.detail || "Failed to submit feedback",
        variant: "destructive",
      });
    },
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success";
      case "requested":
      case "dispatched":
      case "en_route":
      case "on_site":
      case "in_progress":
        return "info";
      case "cancelled":
        return "secondary";
      case "failed":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5" />;
      case "cancelled":
      case "failed":
        return <XCircle className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const getServiceTypeDisplay = (type: string) => {
    const types: Record<string, string> = {
      towing: "Towing Service",
      battery_boost: "Battery Boost",
      flat_tyre: "Flat Tyre Service",
      key_lockout: "Key Lock Out",
      emergency_fuel: "Emergency Fuel Delivery",
      extrication: "Extrication Service",
      mechanical_first_aid: "Mechanical & Electrical First Aid",
      other: "Other",
    };
    return types[type] || type;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-6 w-64 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-6">
        <Link href="/portal/roadside">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Requests
          </Button>
        </Link>
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Request Not Found
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              The roadside assistance request you're looking for doesn't exist.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const req = request as RoadsideRequest;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/portal/roadside">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {req.request_number}
            </h1>
            <Badge variant={getStatusVariant(req.status || 'requested')}>
              {getStatusIcon(req.status || 'requested')}
              <span className="ml-1">{req.status_display || req.status}</span>
            </Badge>
            {req.is_covered_by_subscription && (
              <Badge variant="success" className="text-xs">
                Covered by Subscription
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {getServiceTypeDisplay(req.service_type)}
          </p>
        </div>
        {req.can_be_cancelled && (
          <Button
            variant="destructive"
            onClick={() => setShowCancelDialog(true)}
          >
            Cancel Request
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Service Information */}
          <Card>
            <CardHeader>
              <CardTitle>Service Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Service Type</p>
                  <p className="text-gray-900 dark:text-gray-100">{getServiceTypeDisplay(req.service_type)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Status</p>
                  <Badge variant={getStatusVariant(req.status || 'requested')}>
                    {req.status_display || req.status}
                  </Badge>
                </div>
                {req.vehicle_display && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Vehicle</p>
                    <p className="text-gray-900 dark:text-gray-100">{req.vehicle_display}</p>
                  </div>
                )}
                {req.tow_distance_km && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tow Distance</p>
                    <p className="text-gray-900 dark:text-gray-100">{req.tow_distance_km} km</p>
                  </div>
                )}
              </div>
              {req.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Description</p>
                  <p className="text-gray-900 dark:text-gray-100">{req.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle>Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Breakdown Location</p>
                  <p className="text-gray-900 dark:text-gray-100">{req.breakdown_location}</p>
                </div>
              </div>
              {req.destination && (
                <div className="flex items-start gap-2">
                  <Navigation className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Destination</p>
                    <p className="text-gray-900 dark:text-gray-100">{req.destination}</p>
                  </div>
                </div>
              )}
              {(req.latitude && req.longitude) && (
                <div className="space-y-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    GPS: {req.latitude}, {req.longitude}
                  </div>
                  <RoadsideMap
                    latitude={typeof req.latitude === 'string' ? parseFloat(req.latitude) : req.latitude}
                    longitude={typeof req.longitude === 'string' ? parseFloat(req.longitude) : req.longitude}
                    address={req.breakdown_location}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Requested</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {format(new Date(req.requested_at), "MMM dd, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
              {req.dispatched_at && (
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Dispatched</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(req.dispatched_at), "MMM dd, yyyy 'at' h:mm a")}
                    </p>
                    {req.assigned_technician_name && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        Service Provider: {req.assigned_technician_name}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {req.arrived_at && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Arrived on Site</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(req.arrived_at), "MMM dd, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              )}
              {req.completed_at && (
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Completed</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(req.completed_at), "MMM dd, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer Feedback */}
          {req.status === 'completed' && (
            <Card className="border-none shadow-premium bg-gradient-to-br from-orange-50 to-indigo-50 dark:from-orange-900/10 dark:to-indigo-900/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                  Service Experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                {req.customer_feedback ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Your Feedback:</p>
                    <div className="p-4 bg-white/50 dark:bg-gray-800/50 rounded-xl italic text-sm">
                      "{req.customer_feedback}"
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">How was your experience with our roadside assistance today?</p>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          className="focus:outline-none transition-transform hover:scale-110"
                        >
                          <Star className={`h-8 w-8 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="feedback">Tell us more (Optional)</Label>
                      <Textarea
                        id="feedback"
                        placeholder="What did you like? What can we improve?"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="bg-white/50 dark:bg-gray-800/50"
                      />
                    </div>
                    <Button
                      className="w-full bg-primary hover:bg-primary/90 font-bold gap-2"
                      onClick={() => feedbackMutation.mutate({ rating, customer_feedback: feedback })}
                      disabled={feedbackMutation.isPending}
                    >
                      <Send className="h-4 w-4" />
                      {feedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact & Billing */}
          <Card>
            <CardHeader>
              <CardTitle>Contact & Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Contact Phone</p>
                <p className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {req.customer_phone}
                </p>
              </div>
              {req.is_covered_by_subscription ? (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Covered by Subscription
                  </p>
                  {req.subscription_number && (
                    <p className="text-xs text-green-600 dark:text-green-300 mt-1">
                      Subscription: {req.subscription_number}
                    </p>
                  )}
                </div>
              ) : req.charge_amount && parseFloat(req.charge_amount) > 0 ? (
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Charge Amount</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {formatCurrency(parseFloat(req.charge_amount))}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {req.can_be_cancelled && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowCancelDialog(true)}
                >
                  Cancel Request
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Roadside Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this roadside assistance request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cancel_reason">Reason (Optional)</Label>
              <Textarea
                id="cancel_reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why are you cancelling this request?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCancelDialog(false)}>
              Keep Request
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
