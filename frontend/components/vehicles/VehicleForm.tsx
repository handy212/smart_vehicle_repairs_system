"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Image as ImageIcon, CheckCircle2, ScanBarcode } from "lucide-react";
import { useState, useEffect } from "react";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Image from "next/image";
import { VINDecoderButton } from "@/components/ui/vin-decoder-button";
import { vehiclesApi } from "@/lib/api/vehicles";
import { useToast } from "@/lib/hooks/useToast";
import { Badge } from "@/components/ui/badge";
import { CustomerSelector } from "@/components/customers/CustomerSelector";

const optionalNumber = z.preprocess(
    (val) => (val === "" || val === null || val === undefined || Number.isNaN(val) ? undefined : val),
    z.number().min(0).optional()
);

export const vehicleSchema = z.object({
    vin: z.string()
        .min(17, "VIN must be 17 characters")
        .max(17, "VIN must be 17 characters")
        .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN cannot contain I, O, Q, or special characters"),
    make: z.string().min(1, "Make is required"),
    model: z.string().min(1, "Model is required"),
    year: z.number().min(1900).max(new Date().getFullYear() + 1),
    trim: z.string().optional(),
    license_plate: z.string().optional(),
    license_plate_state: z.string().optional(),
    exterior_color: z.string().optional(),
    interior_color: z.string().optional(),
    current_mileage: optionalNumber,
    mileage_unit: z.enum(["miles", "km"]).optional(),
    engine_type: z.enum(["gasoline", "diesel", "electric", "hybrid", "plug_in_hybrid"]).optional(),
    engine_size: z.string().optional(),
    transmission_type: z.enum(["automatic", "manual", "cvt", "dual_clutch"]).optional(),
    fuel_tank_capacity: optionalNumber,
    tire_size: z.string().optional(),
    owner: z.number().min(1, "Owner is required"),
    status: z.enum(["active", "in_service", "sold", "totaled", "inactive"]),
    vehicle_type: z.enum(["saloon", "suv", "pickup", "minivan", "motorcycle", "truck", "other"]),
    relationship: z.enum(["owner", "driver", "fleet_manager", "other"]),
});

type VehicleFormInput = z.input<typeof vehicleSchema>;
export type VehicleFormData = z.output<typeof vehicleSchema>;

interface VehicleFormProps {
    initialData?: Partial<VehicleFormData> & { image?: string | null };
    /** Current vehicle id when editing — excludes it from VIN duplicate checks / decode. */
    vehicleId?: number;
    customerId?: string | null;
    onSubmit: (data: VehicleFormData, imageFile: File | null) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
    serverFieldErrors?: Record<string, string>;
}

export function VehicleForm({ initialData, vehicleId, customerId, onSubmit, isSubmitting, mode, onCancel, serverFieldErrors }: VehicleFormProps) {
    const { toast } = useToast();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image || null);

    const [showScanner, setShowScanner] = useState(false);
    const [vinOtherInfo, setVinOtherInfo] = useState<Record<string, unknown> | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        setError,
        watch,
        reset,
    } = useForm<VehicleFormInput, unknown, VehicleFormData>({
        resolver: zodResolver(vehicleSchema),
        defaultValues: {
            status: "active",
            engine_type: "gasoline",
            transmission_type: "automatic",
            mileage_unit: "miles",
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
                transmission_type: "automatic",
                mileage_unit: "miles",
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

    const handleVinDecode = (decodedData: {
        year?: number;
        make?: string;
        model?: string;
        trim?: string;
        engine_type?: string;
        engine_size?: string;
        transmission_type?: string;
        body_class?: string;
        vin_other_information?: Record<string, unknown>;
    }) => {
        const opts = { shouldDirty: true, shouldValidate: true } as const;
        if (decodedData.year) setValue("year", decodedData.year, opts);
        if (decodedData.make) setValue("make", decodedData.make, opts);
        if (decodedData.model) setValue("model", decodedData.model, opts);
        if (decodedData.trim) setValue("trim", decodedData.trim, opts);
        if (decodedData.engine_type) {
            setValue("engine_type", decodedData.engine_type as VehicleFormData["engine_type"], opts);
        }
        if (decodedData.engine_size) setValue("engine_size", decodedData.engine_size, opts);
        if (decodedData.transmission_type) {
            const allowed = ["automatic", "manual", "cvt", "dual_clutch"] as const;
            if (allowed.includes(decodedData.transmission_type as (typeof allowed)[number])) {
                setValue(
                    "transmission_type",
                    decodedData.transmission_type as VehicleFormData["transmission_type"],
                    opts
                );
            }
        }
        if (decodedData.vin_other_information) {
            setVinOtherInfo(decodedData.vin_other_information);
            const other = decodedData.vin_other_information;
            if (!decodedData.trim && typeof other.trim === "string" && other.trim) {
                setValue("trim", other.trim, opts);
            }
            if (
                !decodedData.engine_size &&
                typeof other.engine_displacement_l === "string" &&
                other.engine_displacement_l
            ) {
                setValue("engine_size", `${other.engine_displacement_l}L`, opts);
            }
        }

        const bodyClass = (
            decodedData.body_class ||
            (typeof decodedData.vin_other_information?.body_class === "string"
                ? decodedData.vin_other_information.body_class
                : "") ||
            ""
        ).toLowerCase();
        if (bodyClass.includes("sedan") || bodyClass.includes("saloon") || bodyClass.includes("coupe")) {
            setValue("vehicle_type", "saloon", opts);
        } else if (bodyClass.includes("sport utility") || bodyClass.includes("suv")) {
            setValue("vehicle_type", "suv", opts);
        } else if (bodyClass.includes("pickup")) {
            setValue("vehicle_type", "pickup", opts);
        } else if (bodyClass.includes("van") || bodyClass.includes("minivan")) {
            setValue("vehicle_type", "minivan", opts);
        } else if (bodyClass.includes("truck")) {
            setValue("vehicle_type", "truck", opts);
        } else if (bodyClass.includes("motorcycle")) {
            setValue("vehicle_type", "motorcycle", opts);
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
        // Uniqueness only — do not call NHTSA decode on every save
        if (data.vin && data.vin.length === 17) {
            if (mode === "create" || (initialData?.vin && initialData.vin !== data.vin)) {
                try {
                    const vinCheck = await vehiclesApi.checkVin(
                        data.vin.toUpperCase(),
                        mode === "edit" ? vehicleId : undefined
                    );
                    if (vinCheck.success && vinCheck.exists) {
                        setError("vin", { type: "manual", message: "This VIN is already registered." });
                        toast({
                            title: "Duplicate VIN",
                            description: "A vehicle with this VIN already exists.",
                            variant: "destructive",
                        });
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }

        const cleaned: VehicleFormData = { ...data };
        if (
            cleaned.fuel_tank_capacity === undefined ||
            Number.isNaN(cleaned.fuel_tank_capacity as number)
        ) {
            delete (cleaned as { fuel_tank_capacity?: number }).fuel_tank_capacity;
        }
        if (
            cleaned.current_mileage === undefined ||
            Number.isNaN(cleaned.current_mileage as number)
        ) {
            cleaned.current_mileage = 0;
        }

        await onSubmit(cleaned, imageFile);
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
                        <CardContent className="pt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
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
                                        excludeVehicleId={mode === "edit" ? vehicleId : undefined}
                                        persistVehicleId={mode === "edit" ? vehicleId : undefined}
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
                                <label className="text-sm font-medium">Trim</label>
                                <Input
                                    {...register("trim")}
                                    placeholder="e.g. SE, XLE, Sport"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Body Style <span className="text-destructive">*</span></label>
                                <Select
                                    value={watch("vehicle_type")}
                                    onValueChange={(val) => setValue("vehicle_type", val as VehicleFormData["vehicle_type"])}
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
                                <label className="text-sm font-medium">Exterior Color</label>
                                <div className="flex gap-2">
                                    <Input
                                        type="color"
                                        className="w-12 h-10 p-1 cursor-pointer"
                                        value={
                                            watch("exterior_color")?.startsWith("#")
                                                ? watch("exterior_color")
                                                : "#c0c0c0"
                                        }
                                        onChange={(e) => setValue("exterior_color", e.target.value)}
                                    />
                                    <Input
                                        {...register("exterior_color")}
                                        placeholder="e.g. Silver or #C0C0C0"
                                        className="flex-1"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Current Mileage</label>
                                <Input
                                    type="number"
                                    {...register("current_mileage", { valueAsNumber: true })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Mileage Unit</label>
                                <Select
                                    value={watch("mileage_unit") || "miles"}
                                    onValueChange={(val) =>
                                        setValue("mileage_unit", val as VehicleFormData["mileage_unit"])
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="miles">Miles</SelectItem>
                                        <SelectItem value="km">Kilometers</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Registration State / Region</label>
                                <Input
                                    {...register("license_plate_state")}
                                    placeholder="e.g. CA, Nairobi"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Technical Specifications</CardTitle>
                            <CardDescription className="text-xs">
                                Enter any details VIN decode did not fill. You can edit these anytime.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Engine Type</label>
                                <Select
                                    value={watch("engine_type")}
                                    onValueChange={(val) =>
                                        setValue("engine_type", val as VehicleFormData["engine_type"])
                                    }
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
                                <label className="text-sm font-medium">Engine Size</label>
                                <Input
                                    {...register("engine_size")}
                                    placeholder="e.g. 2.0L, 3.5L V6"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Transmission</label>
                                <Select
                                    value={watch("transmission_type") || "automatic"}
                                    onValueChange={(val) =>
                                        setValue(
                                            "transmission_type",
                                            val as VehicleFormData["transmission_type"]
                                        )
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select transmission" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="automatic">Automatic</SelectItem>
                                        <SelectItem value="manual">Manual</SelectItem>
                                        <SelectItem value="cvt">CVT</SelectItem>
                                        <SelectItem value="dual_clutch">Dual Clutch</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Fuel Tank Capacity</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    {...register("fuel_tank_capacity", { valueAsNumber: true })}
                                    placeholder="e.g. 55"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Tire Size</label>
                                <Input
                                    {...register("tire_size")}
                                    placeholder="e.g. 225/45R17"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Interior Color</label>
                                <Input
                                    {...register("interior_color")}
                                    placeholder="e.g. Black, Beige"
                                />
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
                                <CustomerSelector
                                    selectedCustomerId={watch("owner")}
                                    onSelect={(customer) =>
                                        setValue("owner", customer.id, {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                        })
                                    }
                                    placeholder="Search and select a customer..."
                                />
                                {errors.owner && <p className="text-xs text-destructive">{errors.owner.message}</p>}
                            </div>

                            <div className="space-y-2 mt-4">
                                <label className="text-sm font-medium">Relationship</label>
                                <Select
                                    value={watch("relationship")}
                                    onValueChange={(val) =>
                                        setValue("relationship", val as VehicleFormData["relationship"])
                                    }
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

                    {/* Read-only NHTSA extras from VIN decode */}
                    {vinOtherInfo && (
                        <Card className="border-primary/15 bg-primary/5">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium text-primary">
                                    Additional VIN Details
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Informational fields from NHTSA. Editable specs are in Technical Specifications above.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                {Object.entries(vinOtherInfo).slice(0, 12).map(([key, val]) => (
                                    val && typeof val === "string" ? (
                                        <div key={key}>
                                            <span className="block text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                            <span className="font-medium text-foreground">{val}</span>
                                        </div>
                                    ) : null
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <div className="sticky bottom-0 z-10 mt-2 flex justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                        <Button type="button" variant="ghost" onClick={() => onCancel && onCancel()}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting} className="min-w-32 shadow-workshop">
                            {isSubmitting ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-card/30 border-t-white rounded-full animate-spin" />
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
