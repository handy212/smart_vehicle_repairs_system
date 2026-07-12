"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useForm, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, X, Image as ImageIcon, CheckCircle2, ScanBarcode } from "lucide-react";
import { useState, useEffect } from "react";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Image from "next/image";
import { VINDecoderButton } from "@/components/ui/vin-decoder-button";
import { vehiclesApi } from "@/lib/api/vehicles";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from "next/navigation";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/lib/hooks/usePermissions";

export const vehicleSchema = z.object({
    vin: z.string()
        .min(17, "VIN must be 17 characters")
        .max(17, "VIN must be 17 characters")
        .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN cannot contain I, O, Q, or special characters"),
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
    relationship: z.enum(["owner", "driver", "fleet_manager", "other"]),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

interface VehicleFormProps {
    initialData?: Partial<VehicleFormData> & { image?: string | null };
    customerId?: string | null;
    onSubmit: (data: VehicleFormData, imageFile: File | null) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
    serverFieldErrors?: Record<string, string>;
}

export function VehicleForm({ initialData, customerId, onSubmit, isSubmitting, mode, onCancel, serverFieldErrors }: VehicleFormProps) {
    const { toast } = useToast();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image || null);

    const [showScanner, setShowScanner] = useState(false);
    const [vinOtherInfo, setVinOtherInfo] = useState<any | null>(null);
    const { hasPermission } = usePermissions();
    const canListCustomers = hasPermission("view_customers");

    const { data: customersData } = useQuery({
        queryKey: ["customers", "list"],
        queryFn: () => customersApi.list({ page: 1 }),
        enabled: canListCustomers,
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        setError,
        watch,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            relationship: "owner",
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
                relationship: "owner",
                ...initialData,
                owner: initialData.owner || (customerId ? parseInt(customerId) : undefined),
            });
            if (initialData.image) {
                setImagePreview(initialData.image);
            }
        }
    }, [initialData, customerId, reset]);

    // Set server field errors when they arrive
    useEffect(() => {
        if (serverFieldErrors) {
            Object.keys(serverFieldErrors).forEach((field) => {
                setError(field as keyof VehicleFormData, {
                    type: "server",
                    message: serverFieldErrors[field]
                });
            });
        }
    }, [serverFieldErrors, setError]);

    const vinValue = watch("vin");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const yearValue = watch("year");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const makeValue = watch("make");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                    <div className="relative aspect-video border-b border-border bg-muted/40 flex items-center justify-center">
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
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                                <ImageIcon className="w-12 h-12 mb-2 opacity-20" />
                                <span className="text-sm font-medium">No Image</span>
                            </div>
                        )}
                    </div>
                    <div className="p-4">
                        <label className="block w-full">
                            <div className="flex items-center justify-center w-full px-4 py-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted hover:bg-muted/50 transition-colors">
                                <span className="text-sm text-muted-foreground">
                                    {imagePreview ? "Change Photo" : "Upload Photo"}
                                </span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                            </div>
                        </label>
                        <p className="text-[10px] text-center text-muted-foreground mt-2">
                            Supports JPG, PNG • Max 5MB
                        </p>
                    </div>
                </Card>

                {/* Right Col: Basic Info & VIN */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium flex items-center justify-between">
                                Vehicle Identity
                                {mode === 'edit' && <Badge variant="outline">Editing</Badge>}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2 space-y-2">
                                <label className="text-sm font-medium">VIN <span className="text-destructive">*</span></label>
                                <div className="flex gap-2">
                                    <Input
                                        {...register("vin")}
                                        id="vin-input"
                                        className={`font-mono uppercase ${errors.vin ? "border-destructive" : ""}`}
                                        placeholder="17-Digit VIN"
                                        maxLength={17}
                                        onChange={(e) => setValue("vin", e.target.value.toUpperCase())}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setShowScanner(true)}
                                        className="shrink-0"
                                        title="Scan VIN from Camera"
                                    >
                                        <ScanBarcode className="w-4 h-4" />
                                    </Button>
                                    <VINDecoderButton
                                        vin={vinValue || ""}
                                        onDecode={handleVinDecode}
                                        disabled={isSubmitting}
                                    />
                                </div>
                                {errors.vin && <p className="text-xs text-destructive">{errors.vin.message}</p>}
                                <Dialog open={showScanner} onOpenChange={setShowScanner}>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle className="flex items-center gap-2">
                                                <ScanBarcode className="w-5 h-5" />
                                                Scan Vehicle VIN
                                            </DialogTitle>
                                            {/* <DialogDescription>
                                                Point your camera at the 17-digit VIN barcode (usually located on the driver-side door jamb or dashboard).
                                            </DialogDescription> */}
                                        </DialogHeader>
                                        <div className="mt-4">
                                            {showScanner && (
                                                <BarcodeScanner
                                                    onScan={(result) => {
                                                        // VIN barcodes often have an extra character at the start (I, S, etc.)
                                                        // Standard VIN regex: [A-HJ-NPR-Z0-9]{17}
                                                        const vinMatch = result.toUpperCase().match(/[A-HJ-NPR-Z0-9]{17}/);
                                                        const cleanedVin = vinMatch ? vinMatch[0] : result.trim().toUpperCase();

                                                        setValue("vin", cleanedVin, { shouldDirty: true, shouldValidate: true });

                                                        // Force update for the UI input element specifically if needed
                                                        const input = document.getElementById("vin-input") as HTMLInputElement;
                                                        if (input) {
                                                            input.value = cleanedVin;
                                                        }

                                                        setShowScanner(false);
                                                        toast({
                                                            title: "VIN Scanned",
                                                            description: cleanedVin.length === 17 ? "Valid 17-digit VIN captured." : `Captured: ${cleanedVin}`,
                                                        });
                                                    }}
                                                    onClose={() => setShowScanner(false)}
                                                />
                                            )}
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">License Plate</label>
                                <Input
                                    {...register("license_plate")}
                                    placeholder="ABC-123"
                                    className={`uppercase ${errors.license_plate ? "border-destructive" : ""}`}
                                    onChange={(e) => setValue("license_plate", e.target.value.toUpperCase())}
                                />
                                {errors.license_plate && <p className="text-xs text-destructive">{errors.license_plate.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Status</label>
                                <Select
                                    value={watch("status")}

                                    onValueChange={(val) => setValue("status", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="in_service">In Service</SelectItem>
                                        <SelectItem value="sold">Sold</SelectItem>
                                        <SelectItem value="totaled">Totaled</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Details & Specs</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Year <span className="text-destructive">*</span></label>
                                <Input
                                    type="number"
                                    {...register("year", { valueAsNumber: true })}
                                    className={errors.year ? "border-destructive" : ""}
                                />
                                {errors.year && <p className="text-xs text-destructive">{errors.year.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Make <span className="text-destructive">*</span></label>
                                <Input
                                    {...register("make")}
                                    className={errors.make ? "border-destructive" : ""}
                                    placeholder="e.g. Toyota"
                                />
                                {errors.make && <p className="text-xs text-destructive">{errors.make.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Model <span className="text-destructive">*</span></label>
                                <Input
                                    {...register("model")}
                                    className={errors.model ? "border-destructive" : ""}
                                    placeholder="e.g. Camry"
                                />
                                {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Body Style <span className="text-destructive">*</span></label>
                                <Select
                                    value={watch("vehicle_type")}

                                    onValueChange={(val) => setValue("vehicle_type", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select body style" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="saloon">Saloon/Sedan</SelectItem>
                                        <SelectItem value="suv">SUV</SelectItem>
                                        <SelectItem value="pickup">Pick-Up</SelectItem>
                                        <SelectItem value="minivan">Mini Van</SelectItem>
                                        <SelectItem value="motorcycle">Motorcycle</SelectItem>
                                        <SelectItem value="truck">Truck</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Engine Type</label>
                                <Select
                                    value={watch("engine_type")}

                                    onValueChange={(val) => setValue("engine_type", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select engine type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="gasoline">Gasoline</SelectItem>
                                        <SelectItem value="diesel">Diesel</SelectItem>
                                        <SelectItem value="electric">Electric</SelectItem>
                                        <SelectItem value="hybrid">Hybrid</SelectItem>
                                        <SelectItem value="plug_in_hybrid">Plug-in Hybrid</SelectItem>
                                    </SelectContent>
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
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Ownership</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Owner <span className="text-destructive">*</span></label>
                                <Select
                                    value={watch("owner")?.toString()}
                                    onValueChange={(val) => setValue("owner", parseInt(val))}
                                >
                                    <SelectTrigger className={errors.owner ? "border-destructive w-full" : "w-full"}>
                                        <SelectValue placeholder="Select Customer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customersData?.results?.map((customer) => {
                                            const displayName = customer.full_name ||
                                                customer.company_name ||
                                                (customer.user?.first_name ? `${customer.user.first_name} ${customer.user.last_name || ''}` : customer.customer_number);
                                            return (
                                                <SelectItem key={customer.id} value={customer.id.toString()}>
                                                    {displayName}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {errors.owner && <p className="text-xs text-destructive">{errors.owner.message}</p>}
                            </div>

                            <div className="space-y-2 mt-4">
                                <label className="text-sm font-medium">Relationship</label>
                                <Select
                                    value={watch("relationship")}
                                    onValueChange={(val) => setValue("relationship", val as any)}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select relationship" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="owner">Owner</SelectItem>
                                        <SelectItem value="driver">Driver</SelectItem>
                                        <SelectItem value="fleet_manager">Fleet Manager</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* VIN Decoded Information Block */}
                    {vinOtherInfo && (
                        <Card className="border-primary/15 bg-primary/5">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-primary">
                                    Additional VIN Details
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                {Object.entries(vinOtherInfo).slice(0, 8).map(([key, val]) => (
                                    val && typeof val === 'string' ? (
                                        <div key={key}>
                                            <span className="block text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                                            <span className="font-medium text-foreground">{val}</span>
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
