
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Clock, Plus, Calendar, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface EstimateRemindersProps {
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    estimate: any;

    currentUser: any;
}

export function EstimateReminders({ estimate, currentUser }: EstimateRemindersProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [reminderMessage, setReminderMessage] = useState("");
    const [reminderDate, setReminderDate] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Fetch reminders for this estimate
    const { data: remindersData, isLoading } = useQuery({
        queryKey: ["notifications", "estimate", estimate.id],
        queryFn: async () => {
            const response = await notificationsApi.list({
                related_object_type: 'estimate',
                related_object_id: estimate.id,
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
                notification_type: 'estimate',
                channel: 'in_app',
                title: `Reminder: Estimate #${estimate.estimate_number}`,
                message: reminderMessage,
                scheduled_for: new Date(reminderDate).toISOString(),
                related_object_type: 'estimate',
                related_object_id: estimate.id,
                data: {
                    estimate_id: estimate.id,
                    link: `/billing/estimates/${estimate.id}`
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
            queryClient.invalidateQueries({ queryKey: ["notifications", "estimate", estimate.id] });
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
                    <CardTitle>Estimate Reminders</CardTitle>
                    <CardDescription>Scheduled alerts for this estimate</CardDescription>
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
                                Receive a notification about this estimate at a specific time.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="message">Description</Label>
                                <Textarea
                                    id="message"
                                    placeholder="e.g., Follow up on approval..."
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
                    <div className="text-center py-8 text-muted-foreground">Loading reminders...</div>
                ) : remindersData && remindersData.length > 0 ? (
                    <div className="rounded-md border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-muted text-foreground font-medium border-b">
                                <tr>
                                    <th className="px-4 py-3">Description</th>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Remind</th>
                                    <th className="px-4 py-3">Is Notified?</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">

                                {remindersData.map((reminder: any) => (
                                    <tr key={reminder.id} className="hover:bg-muted/50">
                                        <td className="px-4 py-3 font-medium text-foreground">{reminder.message}</td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {reminder.scheduled_for ? (
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                                    {format(new Date(reminder.scheduled_for), "MMM d, yyyy h:mm a")}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic">Not scheduled</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-foreground">
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
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <Bell className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium text-foreground">No Reminders</p>
                        <p className="text-sm max-w-sm mt-1 mb-4">
                            You haven't set any reminders for this estimate yet.
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
