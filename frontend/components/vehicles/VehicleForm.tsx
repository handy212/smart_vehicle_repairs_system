"use client";

import { useForm, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AlertCircle, X, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import Image from "next/image";
import { VINDecoderButton } from "@/components/ui/vin-decoder-button";
import { vehiclesApi } from "@/lib/api/vehicles";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export const vehicleSchema = z.object({
    vin: z.string().min(1, "VIN is required"),
    make: z.string().min(1, "Make is required"),
    model: z.string().min(1, "Model is required"),
    year: z.number().min(1900).max(new Date().getFullYear() + 1),
    license_plate: z.string().optional(),
    exterior_color: z.string().optional(),
    current_mileage: z.number().min(0).optional(),
    engine_type: z.enum(["gasoline", "diesel", "electric", "hybrid", "plug_in_hybrid"]).optional(),
    owner: z.number().min(1, "Owner is required"),
    status: z.enum(["active", "in_service", "sold", "totaled", "inactive"]),
    vehicle_type: z.enum(["saloon", "suv", "pickup", "minivan", "motorcycle", "truck", "other"]),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

interface VehicleFormProps {
    initialData?: Partial<VehicleFormData> & { image?: string | null };
    customerId?: string | null;
    onSubmit: (data: VehicleFormData, imageFile: File | null) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
}

export function VehicleForm({ initialData, customerId, onSubmit, isSubmitting, mode, onCancel }: VehicleFormProps) {
    const { toast } = useToast();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image || null);
    const [vinOtherInfo, setVinOtherInfo] = useState<any | null>(null);

    const { data: customersData } = useQuery({
        queryKey: ["customers", "list"],
        queryFn: () => customersApi.list({ page: 1 }),
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        setError,
        watch,
        control,
        reset,
    } = useForm<VehicleFormData>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: {
            status: "active",
            engine_type: "gasoline",
            owner: customerId ? parseInt(customerId) : undefined,
            current_mileage: 0,
            year: new Date().getFullYear(),
            vehicle_type: "saloon",
            ...initialData,
        },
    });

    // Reset form when initialData changes (for edit mode primarily)
    useEffect(() => {
        if (initialData) {
            reset({
                status: "active",
                engine_type: "gasoline",
                vehicle_type: "saloon",
                current_mileage: 0,
                year: new Date().getFullYear(),
                ...initialData,
                owner: initialData.owner || (customerId ? parseInt(customerId) : undefined),
            });
            if (initialData.image) {
                setImagePreview(initialData.image);
            }
        }
    }, [initialData, customerId, reset]);

    const vinValue = watch("vin");
    const yearValue = watch("year");
    const makeValue = watch("make");
    const modelValue = watch("model");

    const handleVinDecode = (decodedData: {
        year?: number;
        make?: string;
        model?: string;
        engine_type?: string;
        vin_other_information?: any;
    }) => {
        if (decodedData.year) setValue("year", decodedData.year);
        if (decodedData.make) setValue("make", decodedData.make);
        if (decodedData.model) setValue("model", decodedData.model);
        if (decodedData.engine_type) setValue("engine_type", decodedData.engine_type as any);
        if (decodedData.vin_other_information) {
            setVinOtherInfo(decodedData.vin_other_information);

            // Attempt to map VIN body type to vehicle_type
            const bodyClass = decodedData.vin_other_information.body_class?.toLowerCase() || "";
            if (bodyClass.includes("sedan") || bodyClass.includes("saloon") || bodyClass.includes("coupe")) setValue("vehicle_type", "saloon");
            else if (bodyClass.includes("sport utility") || bodyClass.includes("suv")) setValue("vehicle_type", "suv");
            else if (bodyClass.includes("pickup")) setValue("vehicle_type", "pickup");
            else if (bodyClass.includes("van") || bodyClass.includes("minivan")) setValue("vehicle_type", "minivan");
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
    };

    const handleFormSubmit = async (data: VehicleFormData) => {
        // Perform standard uniqueness checks before submitting
        if (data.vin && data.vin.length === 17) {
            // Only run check if VIN changed or we are creating new
            if (mode === "create" || (initialData?.vin && initialData.vin !== data.vin)) {
                try {
                    const vinCheck = await vehiclesApi.decodeVin(data.vin.toUpperCase());
                    if (vinCheck.success && vinCheck.exists && vinCheck.vehicle) {
                        // If checking for edit, ensure it's not the same vehicle
                        if (mode === "create" || (vinCheck.vehicle_id && vinCheck.vehicle_id !== (initialData as any)?.id)) {
                            setError("vin", { type: "manual", message: "This VIN is already registered." });
                            toast({
                                title: "Duplicate VIN",
                                description: "A vehicle with this VIN already exists.",
                                variant: "destructive"
                            });
                            return;
                        }
                    }
                } catch (e) { console.error(e); }
            }
        }

        await onSubmit(data, imageFile);
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">

            {/* Top Section: Vehicle Identity & Image */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Col: Image Upload */}
                <Card className="lg:col-span-1 overflow-hidden h-fit">
                    <div className="aspect-video bg-gray-50 dark:bg-gray-900/50 relative flex items-center justify-center border-b border-gray-100 dark:border-gray-800">
                        {imagePreview ? (
                            <>
                                <Image
                                    src={imagePreview}
                                    alt="Preview"
                                    fill
                                    className="object-contain"
                                    unoptimized={imagePreview.startsWith('http') || imagePreview.startsWith("data:")}
                                />
                                <button
                                    type="button"
                                    onClick={removeImage}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400">
                                <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                <span className="text-sm font-medium">No Image</span>
                            </div>
                        )}
                    </div>
                    <div className="p-4">
                        <label className="block w-full">
                            <div className="flex items-center justify-center w-full px-4 py-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-md cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {imagePreview ? "Change Photo" : "Upload Photo"}
                                </span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                            </div>
                        </label>
                        <p className="text-[10px] text-center text-gray-400 mt-2">
                            Supports JPG, PNG • Max 5MB
                        </p>
                    </div>
                </Card>

                {/* Right Col: Basic Info & VIN */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium flex items-center justify-between">
                                Vehicle Identity
                                {mode === 'edit' && <Badge variant="outline">Editing</Badge>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2 space-y-2">
                                <label className="text-sm font-medium">VIN <span className="text-red-500">*</span></label>
                                <div className="flex gap-2">
                                    <Input
                                        {...register("vin")}
                                        className={`font-mono uppercase ${errors.vin ? "border-red-500" : ""}`}
                                        placeholder="17-Digit VIN"
                                        maxLength={17}
                                        onChange={(e) => setValue("vin", e.target.value.toUpperCase())}
                                    />
                                    <VINDecoderButton
                                        vin={vinValue || ""}
                                        onDecode={handleVinDecode}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                {errors.vin && <p className="text-xs text-red-500">{errors.vin.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">License Plate</label>
                                <Input
                                    {...register("license_plate")}
                                    placeholder="ABC-123"
                                    className="uppercase"
                                    onChange={(e) => setValue("license_plate", e.target.value.toUpperCase())}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Status</label>
                                <Select
                                    {...register("status")}
                                >
                                    <option value="active">Active</option>
                                    <option value="in_service">In Service</option>
                                    <option value="sold">Sold</option>
                                    <option value="totaled">Totaled</option>
                                    <option value="inactive">Inactive</option>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Details & Specs</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Year <span className="text-red-500">*</span></label>
                                <Input
                                    type="number"
                                    {...register("year", { valueAsNumber: true })}
                                    className={errors.year ? "border-red-500" : ""}
                                />
                                {errors.year && <p className="text-xs text-red-500">{errors.year.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Make <span className="text-red-500">*</span></label>
                                <Input
                                    {...register("make")}
                                    className={errors.make ? "border-red-500" : ""}
                                    placeholder="e.g. Toyota"
                                />
                                {errors.make && <p className="text-xs text-red-500">{errors.make.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Model <span className="text-red-500">*</span></label>
                                <Input
                                    {...register("model")}
                                    className={errors.model ? "border-red-500" : ""}
                                    placeholder="e.g. Camry"
                                />
                                {errors.model && <p className="text-xs text-red-500">{errors.model.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Body Style <span className="text-red-500">*</span></label>
                                <Select
                                    {...register("vehicle_type")}
                                >
                                    <option value="saloon">Saloon/Sedan</option>
                                    <option value="suv">SUV</option>
                                    <option value="pickup">Pick-Up</option>
                                    <option value="minivan">Mini Van</option>
                                    <option value="motorcycle">Motorcycle</option>
                                    <option value="truck">Truck</option>
                                    <option value="other">Other</option>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Engine Type</label>
                                <Select
                                    {...register("engine_type")}
                                >
                                    <option value="gasoline">Gasoline</option>
                                    <option value="diesel">Diesel</option>
                                    <option value="electric">Electric</option>
                                    <option value="hybrid">Hybrid</option>
                                    <option value="plug_in_hybrid">Plug-in Hybrid</option>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Current Mileage</label>
                                <Input
                                    type="number"
                                    {...register("current_mileage", { valueAsNumber: true })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Color</label>
                                <div className="flex gap-2">
                                    <div className="relative">
                                        <Input
                                            type="color"
                                            className="w-12 h-10 p-1 cursor-pointer"
                                            onChange={(e) => setValue("exterior_color", e.target.value)}
                                        />
                                    </div>
                                    <Input
                                        {...register("exterior_color")}
                                        placeholder="e.g. Silver or #C0C0C0"
                                        className="flex-1"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Ownership</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Owner <span className="text-red-500">*</span></label>
                                <Select
                                    {...register("owner", { valueAsNumber: true })}
                                    className={errors.owner ? "border-red-500" : ""}
                                >
                                    <option value="">Select Customer</option>
                                    {customersData?.results?.map((customer) => {
                                        const displayName = customer.full_name ||
                                            customer.company_name ||
                                            (customer.user?.first_name ? `${customer.user.first_name} ${customer.user.last_name || ''}` : customer.customer_number);
                                        return (
                                            <option key={customer.id} value={customer.id}>
                                                {displayName}
                                            </option>
                                        );
                                    })}
                                </Select>
                                {errors.owner && <p className="text-xs text-red-500">{errors.owner.message}</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* VIN Decoded Information Block */}
                    {vinOtherInfo && (
                        <Card className="border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-300">
                                    Additional VIN Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                {Object.entries(vinOtherInfo).slice(0, 8).map(([key, val]) => (
                                    val && typeof val === 'string' ? (
                                        <div key={key}>
                                            <span className="block text-gray-500 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                                            <span className="font-medium text-gray-900 dark:text-gray-200">{val}</span>
                                        </div>
                                    ) : null
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="ghost" onClick={() => onCancel && onCancel()}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="min-w-32">
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </div>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    {mode === 'create' ? "Create Vehicle" : "Save Changes"}
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </form>
    );
}
