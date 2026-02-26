"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface RemindersViewProps {
    customerId: number;
}

export function RemindersView({ customerId }: RemindersViewProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    // Simple form state for brevity, could use react-hook-form
    const [formData, setFormData] = useState({ title: "", description: "", due_date: "" });

    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: reminders = [], isLoading } = useQuery({
        queryKey: ["customer-reminders", customerId],
        queryFn: () => customersApi.reminders.list(customerId),
    });

    const createMutation = useMutation({

        mutationFn: (data: any) => customersApi.reminders.create({ ...data, customer: customerId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-reminders", customerId] });
            toast({ title: "Success", description: "Reminder created" });
            setIsDialogOpen(false);
            setFormData({ title: "", description: "", due_date: "" });
        },
    });

    const columns = [
        { header: "Title", accessorKey: "title" },

        { header: "Due Date", accessorKey: "due_date", cell: (item: any) => format(new Date(item.due_date), "MMM dd, yyyy HH:mm") },
        {
            header: "Status",
            accessorKey: "status",

            cell: (item: any) => (
                <Badge variant={item.status === 'completed' ? 'success' : item.status === 'cancelled' ? 'danger' : 'default'}>
                    {item.status}
                </Badge>
            )
        },
        { header: "Created By", accessorKey: "created_by_name" },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setIsDialogOpen(true)} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Reminder
                </Button>
            </div>


            <DataTable data={reminders} columns={columns as any} isLoading={isLoading} />

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Reminder</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(formData); }} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Title</Label>
                            <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Due Date</Label>
                            <Input type="datetime-local" value={formData.due_date} onChange={e => setFormData({ ...formData, due_date: e.target.value })} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={createMutation.isPending}>Save</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
