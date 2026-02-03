"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { servicesApi, VehicleServiceSchedule } from "@/lib/api/services";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Search, FileText, X, Phone, Mail, Send, ExternalLink, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function getDueStatusBadge(schedule: VehicleServiceSchedule) {
  if (!schedule.is_due) {
    if (schedule.days_until_due !== undefined && schedule.days_until_due > 0) {
      if (schedule.days_until_due <= 7) {
        return <Badge variant="default" className="bg-yellow-500">Due Soon ({schedule.days_until_due}d)</Badge>;
      }
      return <Badge variant="secondary">Upcoming ({schedule.days_until_due}d)</Badge>;
    }
    return <Badge variant="secondary">Scheduled</Badge>;
  }
  if (schedule.days_until_due !== undefined && schedule.days_until_due < 0) {
    return <Badge variant="danger">Overdue ({Math.abs(schedule.days_until_due)}d)</Badge>;
  }
  return <Badge variant="danger">Due Now</Badge>;
}

export default function ServicesDuePage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [daysAhead, setDaysAhead] = useState(30);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [selectedSchedules, setSelectedSchedules] = useState<number[]>([]);
  const [sendReminderDialog, setSendReminderDialog] = useState(false);
  const [reminderChannel, setReminderChannel] = useState<"email" | "sms" | "call">("email");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  // Calculate date range
  const today = new Date();
  const dateTo = new Date();
  dateTo.setDate(today.getDate() + daysAhead);

  const { data: servicesDueData, isLoading } = useQuery({
    queryKey: ["services-due", daysAhead, serviceTypeFilter, debouncedSearch],
    queryFn: () => {
      return servicesApi.getServicesDue({
        days_ahead: daysAhead,
        service_type: serviceTypeFilter && serviceTypeFilter !== "all" ? parseInt(serviceTypeFilter) : undefined,
      });
    },
  });

  const { data: serviceTypesData } = useQuery({
    queryKey: ["service-types", "active"],
    queryFn: () => servicesApi.listServiceTypes({ is_active: true }),
  });

  const servicesDue = servicesDueData?.results || [];

  // Filter by search
  const filteredServices = servicesDue.filter((schedule) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return (
      schedule.vehicle_display?.toLowerCase().includes(searchLower) ||
      schedule.service_type_name?.toLowerCase().includes(searchLower) ||
      schedule.customer_name?.toLowerCase().includes(searchLower) ||
      (typeof schedule.vehicle === 'object' && schedule.vehicle?.vin?.toLowerCase().includes(searchLower))
    );
  });

  const sendReminderMutation = useMutation({
    mutationFn: async ({ scheduleIds, channel }: { scheduleIds: number[]; channel: string }) => {
      if (scheduleIds.length === 1) {
        return servicesApi.sendReminder(scheduleIds[0], channel as "email" | "sms" | "call");
      } else {
        return servicesApi.sendBulkReminders(scheduleIds, channel as "email" | "sms" | "call");
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["services-due"] });
      if (data.sent !== undefined) {
        // Bulk response
        toast({
          title: "Reminders Sent",
          description: `Successfully sent ${data.sent} reminder${data.sent !== 1 ? "s" : ""}${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
        });
      } else {
        // Single response
        toast({ title: "Success", description: data.message || "Reminder sent successfully" });
      }
      setSendReminderDialog(false);
      setSelectedSchedules([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to send reminder",
        variant: "destructive",
      });
    },
  });

  const handleSendReminder = () => {
    if (selectedSchedules.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select at least one service to send reminder",
        variant: "destructive",
      });
      return;
    }
    setSendReminderDialog(true);
  };

  const confirmSendReminder = () => {
    sendReminderMutation.mutate({ scheduleIds: selectedSchedules, channel: reminderChannel });
  };

  const toggleScheduleSelection = (scheduleId: number) => {
    setSelectedSchedules((prev) =>
      prev.includes(scheduleId) ? prev.filter((id) => id !== scheduleId) : [...prev, scheduleId]
    );
  };

  const toggleAllSelection = () => {
    if (selectedSchedules.length === filteredServices.length) {
      setSelectedSchedules([]);
    } else {
      setSelectedSchedules(filteredServices.map((s) => s.id));
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <StaffPageHeader title="Services Due" className="pb-2" />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-56">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <Input
              type="text"
              placeholder="Search customer, vehicle, service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* Days Ahead Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Days Ahead:</Label>
            <Select value={daysAhead.toString()} onValueChange={(v) => setDaysAhead(parseInt(v))}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Service Type Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Service Type:</Label>
            <Select value={serviceTypeFilter || "all"} onValueChange={(v) => setServiceTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {serviceTypesData?.results.map((st) => (
                  <SelectItem key={st.id} value={st.id.toString()}>
                    {st.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Clear Filters */}
          {(search || (serviceTypeFilter && serviceTypeFilter !== "all")) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setServiceTypeFilter("all");
              }}
              className="h-8 w-8 p-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {selectedSchedules.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendReminder}
              className="h-8 text-xs"
            >
              <Send className="w-3.5 h-3.5 mr-2" />
              Send Reminder ({selectedSchedules.length})
            </Button>
          )}
        </div>
      </div>

      {/* Services Due Table */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex-1">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} columns={10} />
            </div>
          ) : filteredServices.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-100 dark:border-gray-800">
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedSchedules.length === filteredServices.length && filteredServices.length > 0}
                        onChange={toggleAllSelection}
                        className="rounded border-gray-300"
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Vehicle</TableHead>
                    <TableHead className="text-xs font-semibold">Service Type</TableHead>
                    <TableHead className="text-xs font-semibold">Due Date</TableHead>
                    <TableHead className="text-xs font-semibold">Due Mileage</TableHead>
                    <TableHead className="text-xs font-semibold">Current Mileage</TableHead>
                    <TableHead className="text-xs font-semibold">Days Until Due</TableHead>
                    <TableHead className="text-xs font-semibold">Last Service</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-xs font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredServices.map((schedule) => (
                    <TableRow key={schedule.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedSchedules.includes(schedule.id)}
                          onChange={() => toggleScheduleSelection(schedule.id)}
                          className="rounded border-gray-300"
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>
                          <div className="font-medium">{schedule.customer_name || "N/A"}</div>
                          {schedule.customer_phone && (
                            <div className="text-gray-500 text-xs flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {schedule.customer_phone}
                            </div>
                          )}
                          {schedule.customer_email && (
                            <div className="text-gray-500 text-xs flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {schedule.customer_email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link
                          href={`/vehicles/${typeof schedule.vehicle === 'object' ? schedule.vehicle.id : schedule.vehicle}`}
                          className="text-primary hover:underline"
                        >
                          {schedule.vehicle_display || "N/A"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{schedule.service_type_name || "N/A"}</TableCell>
                      <TableCell className="text-xs">
                        {schedule.next_service_due_date
                          ? format(new Date(schedule.next_service_due_date), "MMM dd, yyyy")
                          : "Not set"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {schedule.next_service_due_mileage
                          ? schedule.next_service_due_mileage.toLocaleString()
                          : "N/A"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {schedule.current_mileage ? schedule.current_mileage.toLocaleString() : "N/A"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {schedule.days_until_due !== undefined ? (
                          <span className={schedule.days_until_due < 0 ? "text-red-600 font-medium" : ""}>
                            {schedule.days_until_due < 0
                              ? `${Math.abs(schedule.days_until_due)} days overdue`
                              : `${schedule.days_until_due} days`}
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {schedule.last_service_date
                          ? format(new Date(schedule.last_service_date), "MMM dd, yyyy")
                          : "Never"}
                      </TableCell>
                      <TableCell>{getDueStatusBadge(schedule)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/vehicles/${typeof schedule.vehicle === 'object' ? schedule.vehicle.id : schedule.vehicle}/services`}
                          >
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No services due found for the selected period.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Reminder Dialog */}
      <Dialog open={sendReminderDialog} onOpenChange={setSendReminderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Service Reminder</DialogTitle>
            <DialogDescription>
              Send reminder to {selectedSchedules.length} customer{selectedSchedules.length !== 1 ? "s" : ""} about
              their upcoming service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Notification Channel</Label>
              <Select value={reminderChannel} onValueChange={(v: any) => setReminderChannel(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="call">Voice Call</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendReminderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSendReminder} disabled={sendReminderMutation.isPending}>
              {sendReminderMutation.isPending ? "Sending..." : "Send Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
