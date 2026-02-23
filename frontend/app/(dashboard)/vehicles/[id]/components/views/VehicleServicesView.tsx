"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { servicesApi, VehicleServiceSchedule } from "@/lib/api/services";
import { inventoryApi, ServiceBundle } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Edit, Check, Calendar, AlertCircle, Trash2, Clock, Settings } from "lucide-react";
import { format } from "date-fns";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Separator } from "@/components/ui/separator";

interface VehicleServicesViewProps {
  vehicleId: number;
}

function getDueStatusBadge(schedule: VehicleServiceSchedule) {
  if (!schedule.is_due) {
    if (schedule.days_until_due !== undefined && schedule.days_until_due > 0) {
      if (schedule.days_until_due <= 7) {
        return <Badge variant="default" className="bg-warning/100 hover:bg-yellow-600">Due Soon</Badge>;
      }
      return <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400">Upcoming</Badge>;
    }
    return <Badge variant="secondary">Scheduled</Badge>;
  }
  if (schedule.days_until_due !== undefined && schedule.days_until_due < 0) {
    return <Badge variant="danger">Overdue</Badge>;
  }
  return <Badge variant="danger">Due Now</Badge>;
}

export function VehicleServicesView({ vehicleId }: VehicleServicesViewProps) {
  const [showAddEditDialog, setShowAddEditDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [selectedSchedule, setSelectedSchedule] = useState<VehicleServiceSchedule | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<VehicleServiceSchedule | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<VehicleServiceSchedule | null>(null);

  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split("T")[0]);
  const [completeMileage, setCompleteMileage] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: schedulesData, isLoading } = useQuery({
    queryKey: ["service-schedules", "vehicle", vehicleId],
    queryFn: () => servicesApi.listServiceSchedules({ vehicle: vehicleId }),
  });

  const { data: serviceTypesData } = useQuery({
    queryKey: ["service-types", "active"],
    queryFn: () => servicesApi.listServiceTypes({ is_active: true }),
  });

  const { data: bundlesData } = useQuery({
    queryKey: ["service-bundles"],
    queryFn: () => inventoryApi.listBundles({ is_active: true }),
  });

  const schedules = schedulesData?.results || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bundles = (Array.isArray(bundlesData) ? bundlesData : (bundlesData as any)?.results || []) as ServiceBundle[];

  const createMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => servicesApi.createServiceSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-schedules"] });
      toast({ title: "Success", description: "Service schedule created successfully" });
      setShowAddEditDialog(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
    toast({
      title: "Error",
      description: error.response?.data?.detail || "Failed to create service schedule",
      variant: "destructive",
    });
  },
  });

const updateMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, data }: { id: number; data: any }) => servicesApi.updateServiceSchedule(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["service-schedules"] });
    toast({ title: "Updated", description: "Service schedule updated successfully" });
    setShowAddEditDialog(false);
    setEditingSchedule(null);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
  toast({
    title: "Error",
    description: error.response?.data?.detail || "Failed to update service schedule",
    variant: "destructive",
  });
},
  });

const deleteMutation = useMutation({
  mutationFn: (id: number) => servicesApi.deleteServiceSchedule(id),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["service-schedules"] });
    toast({ title: "Deleted", description: "Service schedule removed" });
    setShowDeleteDialog(false);
    setScheduleToDelete(null);
  },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
  toast({
    title: "Error",
    description: error.response?.data?.detail || "Failed to delete service schedule",
    variant: "destructive",
  });
},
  });

const completeMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: ({ id, data }: { id: number; data: any }) => servicesApi.markServiceCompleted(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["service-schedules"] });
    toast({ title: "Success", description: "Service marked as completed" });
    setShowCompleteDialog(false);
    setSelectedSchedule(null);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
  toast({
    title: "Error",
    description: error.response?.data?.detail || "Failed to mark service as completed",
    variant: "destructive",
  });
},
  });

const handleSaveService = (formData: FormData) => {
  const serviceTypeId = formData.get("service_type");
  const lastServiceDate = formData.get("last_service_date");
  const lastServiceMileage = formData.get("last_service_mileage");
  const intervalMonths = formData.get("interval_months");
  const intervalMiles = formData.get("interval_miles");
  const notes = formData.get("notes");

  const payload = {
    vehicle: vehicleId,
    service_type: parseInt(serviceTypeId as string),
    last_service_date: lastServiceDate || undefined,
    last_service_mileage: lastServiceMileage ? parseInt(lastServiceMileage as string) : undefined,
    interval_months: intervalMonths ? parseInt(intervalMonths as string) : undefined,
    interval_miles: intervalMiles ? parseInt(intervalMiles as string) : undefined,
    notes: notes as string,
    is_active: true,
  };

  if (editingSchedule) {
    updateMutation.mutate({ id: editingSchedule.id, data: payload });
  } else {
    createMutation.mutate(payload);
  }
};

const handleCompleteService = () => {
  if (!selectedSchedule) return;

  completeMutation.mutate({
    id: selectedSchedule.id,
    data: {
      service_date: completeDate,
      service_mileage: completeMileage ? parseInt(completeMileage) : undefined,
    },
  });
};

const openAddDialog = () => {
  setEditingSchedule(null);
  setShowAddEditDialog(true);
};

const openEditDialog = (schedule: VehicleServiceSchedule) => {
  setEditingSchedule(schedule);
  setShowAddEditDialog(true);
};

const openDeleteDialog = (schedule: VehicleServiceSchedule) => {
  setScheduleToDelete(schedule);
  setShowDeleteDialog(true);
};

return (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-foreground">Service Schedule</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage scheduled maintenance services and intervals
        </p>
      </div>
      <PermissionGuard permission="edit_vehicles">
        <Button onClick={openAddDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Add Schedule
        </Button>
      </PermissionGuard>
    </div>

    {isLoading ? (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    ) : schedules.length > 0 ? (
      <Card className="overflow-hidden border-orange-100 border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold text-card-foreground">Service Type</TableHead>
                <TableHead className="font-semibold text-card-foreground">Last Service</TableHead>
                <TableHead className="font-semibold text-card-foreground">Next Due</TableHead>
                <TableHead className="font-semibold text-card-foreground">Interval Settings</TableHead>
                <TableHead className="font-semibold text-card-foreground">Status</TableHead>
                <TableHead className="text-right font-semibold text-card-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id} className="hover:bg-muted hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="font-medium text-foreground">{schedule.service_type_name || "N/A"}</div>
                    {schedule.notes && (
                      <div className="text-xs text-muted-foreground mt-1 max-w-[200px] truncate" title={schedule.notes}>
                        {schedule.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span className="text-card-foreground">
                        {schedule.last_service_date
                          ? format(new Date(schedule.last_service_date), "MMM dd, yyyy")
                          : "Never"}
                      </span>
                      {schedule.last_service_mileage && (
                        <span className="text-xs text-muted-foreground">
                          @ {schedule.last_service_mileage.toLocaleString()} mi
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-sm">
                      <span className={schedule.is_due ? "font-semibold text-red-600 dark:text-red-400" : "text-card-foreground"}>
                        {schedule.next_service_due_date
                          ? format(new Date(schedule.next_service_due_date), "MMM dd, yyyy")
                          : "Not set"}
                      </span>
                      {schedule.next_service_due_mileage && (
                        <span className="text-xs text-muted-foreground">
                          or {schedule.next_service_due_mileage.toLocaleString()} mi
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center text-muted-foreground">
                      {schedule.interval_months && (
                        <span className="bg-border px-2 py-0.5 rounded text-xs mr-2">
                          {schedule.interval_months} mo
                        </span>
                      )}
                      {schedule.interval_miles && (
                        <span className="bg-border px-2 py-0.5 rounded text-xs">
                          {schedule.interval_miles.toLocaleString()} mi
                        </span>
                      )}
                      {!schedule.interval_months && !schedule.interval_miles && (
                        <span className="text-xs italic text-muted-foreground">Using Default</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getDueStatusBadge(schedule)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PermissionGuard permission="edit_vehicles">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(schedule)}
                          className="h-8 w-8 p-0"
                          title="Edit Schedule"
                        >
                          <Edit className="w-3.5 h-3.5 text-info" />
                        </Button>
                      </PermissionGuard>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSchedule(schedule);
                          setShowCompleteDialog(true);
                        }}
                        className="h-8 px-2 text-success hover:text-green-700 hover:bg-success/10 dark:hover:bg-green-900/20"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Complete
                      </Button>

                      <PermissionGuard permission="edit_vehicles">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(schedule)}
                          className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </PermissionGuard>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    ) : (
      <Card className="border-dashed border-2">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No services scheduled</h3>
          <p className="text-muted-foreground mb-6">Create a maintenance schedule to track services for this vehicle.</p>
          <PermissionGuard permission="edit_vehicles">
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Service
            </Button>
          </PermissionGuard>
        </CardContent>
      </Card>
    )}

    {/* Service Bundles Section */}
    <div className="pt-6">
      <h2 className="text-xl font-bold text-foreground mb-4">Available Service Bundles</h2>
      {bundles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bundles.map((bundle) => (
            <Card key={bundle.id} className="border border-border">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base font-semibold">{bundle.name}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {bundle.service_type_name}
                  </Badge>
                </div>
                <CardDescription>{bundle.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="mb-2 font-medium text-card-foreground">Included Parts:</div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {bundle.items.slice(0, 3).map((item) => (
                    <li key={item.id} className="truncate">
                      {item.quantity}x {item.part_name}
                    </li>
                  ))}
                  {bundle.items.length > 3 && (
                    <li className="list-none text-xs text-muted-foreground pt-1">
                      + {bundle.items.length - 3} more items
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg border border-dashed">
          No service bundles available.
        </div>
      )}
    </div>

    {/* Add/Edit Service Dialog */}
    <Dialog open={showAddEditDialog} onOpenChange={setShowAddEditDialog}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingSchedule ? "Edit Service Schedule" : "Add Service Schedule"}</DialogTitle>
          <DialogDescription>
            {editingSchedule
              ? "Update service details for this maintenance item."
              : "Create a new maintenance schedule."}
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) => handleSaveService(formData)}
          className="space-y-4 py-2"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service_type">Service Type <span className="text-red-500">*</span></Label>
              <Select name="service_type" required defaultValue={editingSchedule?.service_type.toString()}>
                <SelectTrigger>
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypesData?.results.map((st) => (
                    <SelectItem key={st.id} value={st.id.toString()}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="last_service_date">Last Service Date</Label>
                <Input
                  type="date"
                  name="last_service_date"
                  defaultValue={editingSchedule?.last_service_date || new Date().toISOString().split("T")[0]}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_service_mileage">Last Mileage</Label>
                <Input
                  type="number"
                  name="last_service_mileage"
                  placeholder="e.g. 50000"
                  defaultValue={editingSchedule?.last_service_mileage?.toString()}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval_months">Interval (Months)</Label>
                <Input
                  type="number"
                  name="interval_months"
                  placeholder="Default"
                  defaultValue={editingSchedule?.interval_months?.toString()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval_miles">Interval (Miles)</Label>
                <Input
                  type="number"
                  name="interval_miles"
                  placeholder="Default"
                  defaultValue={editingSchedule?.interval_miles?.toString()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                name="notes"
                placeholder="Optional notes"
                defaultValue={editingSchedule?.notes || ""}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowAddEditDialog(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingSchedule ? "Update" : "Create"
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Mark Complete Dialog */}
    <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Service as Completed</DialogTitle>
          <DialogDescription>
            Record that {selectedSchedule?.service_type_name} has been completed
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="bg-info/10 dark:bg-blue-900/20 p-3 rounded-md flex items-start gap-3 text-sm text-blue-700 dark:text-blue-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>This will update the last service date/mileage and automatically calculate the next due date.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="complete_date">Service Date *</Label>
              <Input
                type="date"
                id="complete_date"
                value={completeDate}
                onChange={(e) => setCompleteDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="complete_mileage">Service Mileage</Label>
              <Input
                type="number"
                id="complete_mileage"
                value={completeMileage}
                onChange={(e) => setCompleteMileage(e.target.value)}
                placeholder="Current mileage"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setShowCompleteDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCompleteService} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Saving..." : "Mark Complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Delete Confirmation Dialog */}
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently remove the service schedule for
            <span className="font-semibold text-foreground"> {scheduleToDelete?.service_type_name}</span>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setScheduleToDelete(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => scheduleToDelete && deleteMutation.mutate(scheduleToDelete.id)}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete Schedule"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
}
