"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { DataTable } from "@/components/shared/DataTable";
import { FilterBar } from "@/components/shared/FilterBar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";

interface ContactsViewProps {
    customerId: number;
}

const contactSchema = z.object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    job_title: z.string().optional(),
    is_primary: z.boolean().optional(),
    is_billing: z.boolean().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

export function ContactsView({ customerId }: ContactsViewProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingContact, setEditingContact] = useState<any>(null);
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: contacts = [], isLoading } = useQuery({
        queryKey: ["customer-contacts", customerId],
        queryFn: () => customersApi.contacts.list(customerId),
    });

    const createMutation = useMutation({
        mutationFn: (data: ContactFormData) => customersApi.contacts.create({ ...data, customer: customerId }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-contacts", customerId] });
            toast({ title: "Success", description: "Contact created successfully" });
            setIsDialogOpen(false);
            reset();
        },
        onError: () => toast({ title: "Error", description: "Failed to create contact", variant: "destructive" }),
    });

    const updateMutation = useMutation({
        mutationFn: (data: ContactFormData) => customersApi.contacts.update(editingContact.id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-contacts", customerId] });
            toast({ title: "Success", description: "Contact updated successfully" });
            setIsDialogOpen(false);
            setEditingContact(null);
            reset();
        },
        onError: () => toast({ title: "Error", description: "Failed to update contact", variant: "destructive" }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => customersApi.contacts.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-contacts", customerId] });
            toast({ title: "Success", description: "Contact deleted successfully" });
        },
        onError: () => toast({ title: "Error", description: "Failed to delete contact", variant: "destructive" }),
    });


    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ContactFormData>({
        resolver: zodResolver(contactSchema),
    });

    const onSubmit = (data: ContactFormData) => {
        if (editingContact) {
            updateMutation.mutate(data);
        } else {
            createMutation.mutate(data);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEdit = (contact: any) => {
        setEditingContact(contact);
        setValue("first_name", contact.first_name);
        setValue("last_name", contact.last_name);
        setValue("email", contact.email);
        setValue("phone", contact.phone);
        setValue("job_title", contact.job_title);
        setValue("is_primary", contact.is_primary);
        setValue("is_billing", contact.is_billing);
        setIsDialogOpen(true);
    };

    const columns = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Name", accessorKey: "first_name", cell: (item: any) => <span className="font-medium text-foreground">{item.first_name} {item.last_name}</span> },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { header: "Email", accessorKey: "email", cell: (item: any) => <span className="text-muted-foreground">{item.email}</span> },
        { header: "Position", accessorKey: "job_title" },
        { header: "Phone", accessorKey: "phone" },
        {
            header: "Status",
            accessorKey: "status",
            cell: () => <Badge variant="outline" className="bg-success/10 text-green-700 border-green-200">Active</Badge>
        },
        {
            header: "Last Login",
            accessorKey: "last_login",
            cell: () => <span className="text-muted-foreground">-</span>
        },
        {
            header: "Roles",
            accessorKey: "roles",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: (item: any) => (
                <div className="flex gap-1">
                    {item.is_primary && <Badge variant="default" className="text-[10px]">Primary</Badge>}
                    {item.is_billing && <Badge variant="secondary" className="text-[10px]">Billing</Badge>}
                </div>
            )
        },
        {
            header: "Actions",
            accessorKey: "actions",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: (item: any) => (
                <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(item); }}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); if (confirm('Delete contact?')) deleteMutation.mutate(item.id); }}>Delete</Button>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <FilterBar onSearch={() => { }} className="flex-1 mb-0" placeholder="Search contacts..." />
                <Button onClick={() => { setEditingContact(null); reset(); setIsDialogOpen(true); }} size="sm" className="ml-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Contact
                </Button>
            </div>

            <DataTable
                data={contacts}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                columns={columns as any}
                isLoading={isLoading}
                onRowClick={handleEdit}
            />

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="first_name">First Name</Label>
                                <Input {...register("first_name")} />
                                {errors.first_name && <p className="text-red-500 text-xs">{errors.first_name.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_name">Last Name</Label>
                                <Input {...register("last_name")} />
                                {errors.last_name && <p className="text-red-500 text-xs">{errors.last_name.message}</p>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input {...register("email")} type="email" />
                            {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone</Label>
                            <Input {...register("phone")} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="job_title">Job Title</Label>
                            <Input {...register("job_title")} />
                        </div>

                        <div className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <input type="checkbox" id="is_primary" {...register("is_primary")} className="rounded border-border" />
                                <Label htmlFor="is_primary">Primary Contact</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <input type="checkbox" id="is_billing" {...register("is_billing")} className="rounded border-border" />
                                <Label htmlFor="is_billing">Billing Contact</Label>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button type="submit">Save</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
