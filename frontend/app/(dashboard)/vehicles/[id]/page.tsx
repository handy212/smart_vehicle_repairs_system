"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { vehiclesApi } from "@/lib/api/vehicles";
import { customersApi } from "@/lib/api/customers";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { roadsideApi } from "@/lib/api/roadside";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, UserCog } from "lucide-react";
import Link from "next/link";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { VehicleSidebar } from "./components/VehicleSidebar";
import { VehicleProfileView } from "./components/views/VehicleProfileView";
import { VehicleHistoryView } from "./components/views/VehicleHistoryView";
import { VehicleDocumentsView } from "./components/views/VehicleDocumentsView";
import { VehicleRoadsideView } from "./components/views/VehicleRoadsideView";
import { VehicleServicesView } from "./components/views/VehicleServicesView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";

import { useEffect, useState } from "react";
import { useRecentItems } from "@/lib/hooks/useRecentItems";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = parseInt(params.id as string);
  const initialView = searchParams.get("view") || "profile";
  const [activeView, setActiveView] = useState(initialView);
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState<string>("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [transferNotes, setTransferNotes] = useState("");
  const { addRecentItem } = useRecentItems();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Update URL and state when view changes
  useEffect(() => {
    // If search params change (e.g. back button), update state
    const currentView = searchParams.get("view") || "profile";
    if (currentView !== activeView) {
      setActiveView(currentView);
    }
  }, [searchParams, activeView]);

  const handleViewChange = (view: string) => {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view === "profile") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", view);
    }
    window.history.pushState({}, "", url.toString());
  };

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
  });

  useEffect(() => {
    if (vehicle) {
      addRecentItem({
        id: vehicle.id,
        name: `${vehicle.make} ${vehicle.model} (${vehicle.year})`,
        type: "vehicle",
        href: `/vehicles/${vehicle.id}`,
      });
    }
  }, [vehicle, addRecentItem]);

  // Fetch work orders and appointments for this vehicle
  // We can optimize this later to only fetch when needed, but for now pre-fetching is fine for similar UX
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "vehicle", vehicleId],
    queryFn: () => workordersApi.list({ vehicle: vehicleId }), // Optimized to search by vehicle ID if API supports it
    enabled: !!vehicleId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "vehicle", vehicleId],
    queryFn: () => appointmentsApi.list(),
    enabled: !!vehicleId,
  });

  const { data: roadsideRequestsData } = useQuery({
    queryKey: ["roadside", "vehicle", vehicleId],
    queryFn: () => roadsideApi.list({ vehicle: vehicleId }),
    enabled: !!vehicleId,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  const roadsideRequests = roadsideRequestsData?.results || [];

  const reassignOwnerMutation = useMutation({
    mutationFn: (data: { new_owner_id: number; transfer_date?: string; notes?: string }) =>
      vehiclesApi.reassignOwner(vehicleId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-ownership-history", vehicleId] });
      toast({
        title: "Success",
        description: data.message || "Vehicle ownership reassigned successfully",
      });
      setShowReassignDialog(false);
      setNewOwnerId("");
      setTransferNotes("");
      setTransferDate(new Date().toISOString().split("T")[0]);
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to reassign vehicle ownership",
        variant: "destructive",
      });
    },
  });

  const handleReassignOwner = () => {
    if (!newOwnerId) {
      toast({
        title: "Validation Error",
        description: "Please select a new owner",
        variant: "destructive",
      });
      return;
    }

    const currentOwnerId = typeof vehicle?.owner === "object" ? vehicle.owner.id : vehicle?.owner;
    if (parseInt(newOwnerId) === currentOwnerId) {
      toast({
        title: "Validation Error",
        description: "New owner must be different from current owner",
        variant: "destructive",
      });
      return;
    }

    reassignOwnerMutation.mutate({
      new_owner_id: parseInt(newOwnerId),
      transfer_date: transferDate,
      notes: transferNotes,
    });
  };

  // Filter work orders and appointments for this vehicle if API didn't filter
  const vehicleWorkOrders = workOrdersData?.results || [];

  const vehicleAppointments = appointmentsData?.results?.filter(
    (apt) =>
      (typeof apt.vehicle === "object" && apt.vehicle !== null
        ? apt.vehicle.id
        : apt.vehicle) === vehicleId
  ) || [];


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="bg-destructive/10 dark:bg-red-900/20 text-destructive dark:text-red-400 p-4 rounded-md">
          Error loading vehicle. Please try again.
        </div>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "in_service":
        return "warning";
      case "sold":
        return "secondary";
      default:
        return "default";
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case "profile":
        return (
          <VehicleProfileView
            vehicle={vehicle}
            vehicleWorkOrders={vehicleWorkOrders}
            vehicleAppointments={vehicleAppointments}
          />
        );
      case "history":
        return (
          <VehicleHistoryView
            vehicleId={vehicleId}
            workOrders={vehicleWorkOrders}
          />
        );
      case "services":
        return <VehicleServicesView vehicleId={vehicleId} />;
      case "documents":
        return <VehicleDocumentsView vehicleId={vehicleId} />;
      case "roadside":
        return <VehicleRoadsideView roadsideRequests={roadsideRequests} />;
      default:
        return <VehicleProfileView vehicle={vehicle} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <Link href="/vehicles">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to List
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">
                {vehicle.make} {vehicle.model} {vehicle.year}
              </h1>

              <Badge variant={getStatusVariant(vehicle.status) as any} className="capitalize">
                {vehicle.status?.replace(/_/g, " ") || vehicle.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 font-mono">
              VIN: {vehicle.vin}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGuard permission="edit_vehicles">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReassignDialog(true)}
            >
              <UserCog className="w-4 h-4 mr-2" />
              Reassign Owner
            </Button>
            <Link href={`/vehicles/${vehicleId}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="w-4 h-4 mr-2" />
                Edit Vehicle
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <VehicleSidebar
          vehicleId={vehicleId}
          activeView={activeView}
          onViewChange={handleViewChange}
        />
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>

      {/* Reassign Owner Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Vehicle Ownership</DialogTitle>
            <DialogDescription>
              Transfer this vehicle from the current owner to a new owner. This will update all related records.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current_owner">Current Owner</Label>
              <Input
                id="current_owner"
                value={
                  vehicle?.owner_name ||
                  (() => {
                    const currentOwnerId = typeof vehicle?.owner === "object" ? vehicle.owner.id : vehicle?.owner;
                    const currentOwner = customersData?.results?.find((c) => c.id === currentOwnerId);
                    if (currentOwner) {
                      return currentOwner.full_name ||
                        (currentOwner.user ? `${currentOwner.user.first_name} ${currentOwner.user.last_name}`.trim() : '') ||
                        currentOwner.company_name ||
                        `Customer #${currentOwner.customer_number}`;
                    }
                    return "N/A";
                  })()
                }
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_owner">New Owner *</Label>
              <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                <SelectTrigger id="new_owner">
                  <SelectValue placeholder="Select new owner" />
                </SelectTrigger>
                <SelectContent>
                  {customersData?.results
                    ?.filter((c) => {
                      const currentOwnerId = typeof vehicle?.owner === "object" ? vehicle.owner.id : vehicle?.owner;
                      return c.id !== currentOwnerId;
                    })
                    .map((customer) => {
                      const displayName = customer.full_name ||
                        (customer.user ? `${customer.user.first_name} ${customer.user.last_name}`.trim() : '') ||
                        customer.company_name ||
                        `Customer #${customer.customer_number}`;
                      return (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {displayName} ({customer.customer_number})
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer_date">Transfer Date *</Label>
              <Input
                id="transfer_date"
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer_notes">Notes (Optional)</Label>
              <Textarea
                id="transfer_notes"
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="e.g., Vehicle sold to new owner, continuing service with AA"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReassignOwner}
              disabled={reassignOwnerMutation.isPending || !newOwnerId}
            >
              {reassignOwnerMutation.isPending ? "Reassigning..." : "Reassign Ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
