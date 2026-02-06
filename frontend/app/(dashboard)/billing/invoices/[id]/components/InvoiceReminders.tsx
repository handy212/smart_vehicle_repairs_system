
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api/notifications";
import { useToast } from "@/lib/hooks/useToast";
import { Clock, Plus, Calendar, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface InvoiceRemindersProps {
    invoice: any;
    currentUser: any;
}

export function InvoiceReminders({ invoice, currentUser }: InvoiceRemindersProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [reminderMessage, setReminderMessage] = useState("");
    const [reminderDate, setReminderDate] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Fetch reminders for this invoice
    const { data: remindersData, isLoading } = useQuery({
        queryKey: ["notifications", "invoice", invoice.id],
        queryFn: async () => {
            const response = await notificationsApi.list({
                related_object_type: 'invoice',
                related_object_id: invoice.id,
                ordering: '-scheduled_for'
            });
            return response.results;
        },
    });

    const createReminderMutation = useMutation({
        mutationFn: async () => {
            if (!reminderDate || !reminderMessage) return;

            return notificationsApi.create({
                recipient: currentUser.id,
                notification_type: 'invoice',
                channel: 'in_app',
                title: `Reminder: Invoice #${invoice.invoice_number}`,
                message: reminderMessage,
                scheduled_for: new Date(reminderDate).toISOString(),
                related_object_type: 'invoice',
                related_object_id: invoice.id,
                data: {
                    invoice_id: invoice.id,
                    link: `/billing/invoices/${invoice.id}`
                }
            });
        },
        onSuccess: () => {
            toast({
                title: "Reminder Set",
                description: "You will be notified at the scheduled time.",
                variant: "success",
            });
            setIsDialogOpen(false);
            setReminderMessage("");
            setReminderDate("");
            queryClient.invalidateQueries({ queryKey: ["notifications", "invoice", invoice.id] });
        },
        onError: (error) => {
            console.error("Failed to create reminder:", error);
            toast({
                title: "Failed to Set Reminder",
                description: "Please try again.",
                variant: "destructive",
            });
        },
    });

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                    <CardTitle>Invoice Reminders</CardTitle>
                    <CardDescription>Scheduled alerts for this invoice</CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="w-4 h-4 mr-2" />
                            Set Reminder
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Set Reminder</DialogTitle>
                            <DialogDescription>
                                Receive a notification about this invoice at a specific time.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="message">Description</Label>
                                <Textarea
                                    id="message"
                                    placeholder="e.g., Follow up on payment..."
                                    value={reminderMessage}
                                    onChange={(e) => setReminderMessage(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="date">Date & Time</Label>
                                <Input
                                    id="date"
                                    type="datetime-local"
                                    value={reminderDate}
                                    onChange={(e) => setReminderDate(e.target.value)}
                                    min={new Date().toISOString().slice(0, 16)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button
                                onClick={() => createReminderMutation.mutate()}
                                disabled={!reminderMessage || !reminderDate || createReminderMutation.isPending}
                            >
                                {createReminderMutation.isPending ? "Scheduling..." : "Set Reminder"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading reminders...</div>
                ) : remindersData && remindersData.length > 0 ? (
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                <tr>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Remind</th>
                                    <th className="px-4 py-3">Is Notified?</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {remindersData.map((reminder: any) => (
                                    <tr key={reminder.id} className="hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{reminder.message}</td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {reminder.scheduled_for ? (
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    {format(new Date(reminder.scheduled_for), "MMM d, yyyy h:mm a")}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic">Not scheduled</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {/* Assuming reminder.recipient_name property exists or we strictly show current user if it matches */}
                                            {/* In 'create' we send currentUser.id. API returns `recipient` ID. API Serializer returns `recipient_name` */}
                                            {reminder.recipient_name || "Me"}
                                        </td>
                                        <td className="px-4 py-3">
                                            {reminder.status === 'sent' || reminder.status === 'read' ? (
                                                <Badge variant="success" className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                                                    Yes
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-warning/10 text-yellow-700 border-yellow-200">
                                                    No
                                                </Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
                        <Bell className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium text-gray-900">No Reminders</p>
                        <p className="text-sm max-w-sm mt-1 mb-4">
                            You haven't set any reminders for this invoice yet.
                        </p>
                        <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                            Set Reminder
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
