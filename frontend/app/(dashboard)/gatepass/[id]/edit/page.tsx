"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gatepassApi } from "@/lib/api/gatepass";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertCircle, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { Skeleton } from "@/components/ui/skeleton";

const gatePassSchema = z.object({
    picked_up_by_customer: z.boolean(),
    pickup_person_name: z.string().optional(),
    pickup_person_relationship: z.string().optional(),
    pickup_person_id_type: z.string().optional(),
    pickup_person_id_number: z.string().optional(),
    pickup_person_phone: z.string().optional(),
    pickup_notes: z.string().optional(),
}).refine((data) => {
    if (!data.picked_up_by_customer && !data.pickup_person_name) {
        return false;
    }
    return true;
}, {
    message: "Pickup person name is required when customer is not picking up",
    path: ["pickup_person_name"],
});

type GatePassFormData = z.infer<typeof gatePassSchema>;

export default function EditGatePassPage() {
    const router = useRouter();
    const params = useParams();
    const gatePassId = parseInt(params.id as string);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [serverError, setServerError] = useState<string | null>(null);

    const { data: gatePass, isLoading, error } = useQuery({
        queryKey: ["gatepass", gatePassId],
        queryFn: () => gatepassApi.get(gatePassId),
    });

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
        watch,
        setValue,
        reset,
    } = useForm<GatePassFormData>({
        resolver: zodResolver(gatePassSchema),
        defaultValues: {
            picked_up_by_customer: true,
            pickup_person_name: "",
            pickup_person_relationship: "",
            pickup_person_id_type: "",
            pickup_person_id_number: "",
            pickup_person_phone: "",
            pickup_notes: "",
        },
    });

    useEffect(() => {
        if (gatePass) {
            reset({
                picked_up_by_customer: gatePass.picked_up_by_customer,
                pickup_person_name: gatePass.pickup_person_name || "",
                pickup_person_relationship: gatePass.pickup_person_relationship || "",
                pickup_person_id_type: gatePass.pickup_person_id_type || "",
                pickup_person_id_number: gatePass.pickup_person_id_number || "",
                pickup_person_phone: gatePass.pickup_person_phone || "",
                pickup_notes: gatePass.pickup_notes || "",
            });
        }
    }, [gatePass, reset]);

    const updateMutation = useMutation({
        mutationFn: (data: GatePassFormData) => gatepassApi.update(gatePassId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["gatepass", gatePassId] });
            queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
            toast({
                title: "Success",
                description: "Gate pass updated successfully",
            });
            router.push(`/gatepass/${gatePassId}`);
        },
        onError: (error) => {
            console.error("Error updating gate pass:", error);
            if (error instanceof AxiosError && error.response?.data) {
                const errorData = error.response.data;
                if (errorData.detail) {
                    setServerError(errorData.detail);
                } else {
                    setServerError("An error occurred. Please check the form details.");
                }
            } else {
                setServerError("An unexpected error occurred. Please try again.");
            }
        },
    });

    const onSubmit = async (data: GatePassFormData) => {
        setServerError(null);
        updateMutation.mutate(data);
    };

    const pickedUpByCustomer = watch("picked_up_by_customer");

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-10 w-24" />
                    <div>
                        <Skeleton className="h-8 w-48 mb-2" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-32 mb-2" />
                        <Skeleton className="h-4 w-64" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (error || !gatePass) {
        return (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                Error loading gate pass. Please try again.
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4">
                <Link href={`/gatepass/${gatePassId}`}>
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                        Edit Gate Pass: {gatePass.gate_pass_number}
                    </h1>
                    <p className="text-sm text-muted-foreground">Update pickup details</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Card className="border-t-4 border-t-primary shadow-md hover:shadow-lg transition-shadow duration-200">
                    <CardHeader>
                        <CardTitle>Pickup Information</CardTitle>
                        <CardDescription>Who is picking up the vehicle?</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg border border-border">
                                <input
                                    type="checkbox"
                                    id="picked_up_by_customer"
                                    checked={pickedUpByCustomer}
                                    onChange={(e) => setValue("picked_up_by_customer", e.target.checked)}
                                    className="h-4 w-4 rounded border-primary text-primary focus:ring-primary"
                                />
                                <Label htmlFor="picked_up_by_customer" className="cursor-pointer font-medium">
                                    Customer is picking up the vehicle
                                </Label>
                            </div>
                        </div>

                        <div className={`space-y-4 transition-all duration-300 ${pickedUpByCustomer ? 'opacity-50 pointer-events-none grayscale' : 'opacity-100'}`}>
                            <div className="space-y-2">
                                <Label htmlFor="pickup_person_name">
                                    Pickup Person Name {pickedUpByCustomer ? "" : "*"}
                                </Label>
                                <Input
                                    id="pickup_person_name"
                                    {...register("pickup_person_name")}
                                    placeholder="Enter full name"
                                    className={errors.pickup_person_name ? "border-destructive" : ""}
                                    disabled={pickedUpByCustomer}
                                />
                                {errors.pickup_person_name && (
                                    <p className="text-xs text-destructive">{errors.pickup_person_name.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pickup_person_relationship">Relationship to Customer</Label>
                                <Input
                                    id="pickup_person_relationship"
                                    {...register("pickup_person_relationship")}
                                    placeholder="e.g., Brother, Employee, Friend"
                                    disabled={pickedUpByCustomer}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="pickup_person_id_type">ID Type</Label>
                                    <Select
                                        value={watch("pickup_person_id_type") || ""}
                                        onValueChange={(value) => setValue("pickup_person_id_type", value)}
                                        disabled={pickedUpByCustomer}
                                    >
                                        <SelectTrigger id="pickup_person_id_type">
                                            <SelectValue placeholder="Select ID type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="driver_license">Driver License</SelectItem>
                                            <SelectItem value="national_id">National ID</SelectItem>
                                            <SelectItem value="passport">Passport</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pickup_person_id_number">ID Number</Label>
                                    <Input
                                        id="pickup_person_id_number"
                                        {...register("pickup_person_id_number")}
                                        placeholder="Enter ID number"
                                        disabled={pickedUpByCustomer}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="pickup_person_phone">Phone Number</Label>
                                <Input
                                    id="pickup_person_phone"
                                    {...register("pickup_person_phone")}
                                    placeholder="Enter phone number"
                                    disabled={pickedUpByCustomer}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pickup_notes">Additional Notes</Label>
                            <Textarea
                                id="pickup_notes"
                                {...register("pickup_notes")}
                                placeholder="Any additional notes about the pickup..."
                                rows={3}
                            />
                        </div>
                    </CardContent>
                </Card>

                {serverError && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Error</p>
                            <p className="text-sm">{serverError}</p>
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3">
                    <Link href={`/gatepass/${gatePassId}`}>
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </Link>
                    <Button type="submit" disabled={isSubmitting || updateMutation.isPending} className="min-w-[120px]">
                        {isSubmitting || updateMutation.isPending ? (
                            "Saving..."
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Changes
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
