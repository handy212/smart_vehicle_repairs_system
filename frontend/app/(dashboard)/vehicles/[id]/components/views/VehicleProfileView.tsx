"use client";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { sumWorkOrderInvoiceAmounts } from "@/lib/workorders/workOrderBillingDisplay";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Vehicle, vehiclesApi } from "@/lib/api/vehicles";
import Image from "next/image";
import Link from "next/link";
import { getMediaUrl } from "@/lib/api/utils";
import { Calendar, FileText, ArrowUpRight, Car, User, History, ArrowRight, HeartPulse, DollarSign, Gauge, Cog, Fuel, Activity, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

function DataField({
    label,
    value,
    icon: Icon,
    className
}: {
    label: string;
    value: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }> | null;
    className?: string;
}) {
    return (
        <div className={`space-y-0.5 ${className}`}>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                {Icon && <Icon className="w-3 h-3" />}
                {label}
            </span>
            <div className="text-sm font-medium text-foreground truncate line-clamp-1">{value || <span className="text-muted-foreground font-normal">-</span>}</div>
        </div>
    );
}

interface VehicleProfileViewProps {
    vehicle: Vehicle;

    vehicleWorkOrders?: any[];

    vehicleAppointments?: any[];
}

export function VehicleProfileView({ vehicle, vehicleWorkOrders = [], vehicleAppointments = [] }: VehicleProfileViewProps) {
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showImageModal, setShowImageModal] = useState(false);
    const [showOwnershipHistory, setShowOwnershipHistory] = useState(false);

    const { data: ownershipHistory } = useQuery({
        queryKey: ["vehicle-ownership-history", vehicle.id],
        queryFn: () => vehiclesApi.getOwnershipHistory(vehicle.id),
        enabled: showOwnershipHistory,
    });

    const decodeSpecsMutation = useMutation({
        mutationFn: () => vehiclesApi.refreshVinDecode(vehicle.id, { force: true }),
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ["vehicle", vehicle.id] });
            toast({
                title: result.partial ? "Partial VIN decode" : "VIN specs saved",
                description: result.message || "Vehicle specs updated.",
                variant: result.partial ? "warning" : "default",
            });
        },
        onError: (error: unknown) => {
            toast({
                title: "VIN decode failed",
                description: getUserFacingError(error, "Could not decode VIN specs"),
                variant: "destructive",
            });
        },
    });

    const canDecodeVin = Boolean(vehicle.vin && String(vehicle.vin).trim().length === 17);

    // Calculate stats
    const totalServices = vehicleWorkOrders.length;
    const totalSpent = sumWorkOrderInvoiceAmounts(vehicleWorkOrders);

    const completedWorkOrders = vehicleWorkOrders.filter((wo) => wo.status === "completed");
    const lastServiceDate = completedWorkOrders.length > 0
        ? completedWorkOrders.sort((a, b) =>
            new Date(b.completed_at || b.created_at).getTime() -
            new Date(a.completed_at || a.created_at).getTime()
        )[0]?.completed_at || completedWorkOrders[0]?.created_at
        : null;


    const vinData = (vehicle as any)?.vin_decoded_data || null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Main Content Area (8/12) */}
                <div className="lg:col-span-8 space-y-6">

                    {/* Hero Section */}
                    <Card className="overflow-hidden border-none shadow-md bg-card">
                        <div className="flex flex-col md:flex-row">
                            {/* Vehicle Image */}
                            <div className="w-full md:w-1/3 relative bg-muted bg-background group cursor-pointer" onClick={() => vehicle.image && setShowImageModal(true)}>
                                {vehicle.image ? (
                                    <Image
                                        src={getMediaUrl(vehicle.image)}
                                        alt={`${vehicle.make} ${vehicle.model}`}
                                        fill
                                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                                        sizes="(max-width: 768px) 100vw, 33vw"
                                        unoptimized={vehicle.image?.startsWith("http")}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground">
                                        <Car className="w-12 h-12 mb-2 opacity-50" />
                                        <span className="text-xs">No Image</span>
                                    </div>
                                )}
                                {vehicle.image && (
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">View</span>
                                    </div>
                                )}
                            </div>

                            {/* Key Details */}
                            <div className="flex-1 p-6 flex flex-col justify-center">
                                <div className="mb-6">
                                    <h1 className="text-xl font-bold text-foreground flex items-center gap-3">
                                        {vehicle.year} {vehicle.make} {vehicle.model}
                                        {(vehicle.trim || vinData?.trim) && (
                                            <Badge variant="secondary" className="font-normal text-xs">
                                                {vehicle.trim || vinData?.trim}
                                            </Badge>
                                        )}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Badge variant="outline" className="text-muted-foreground font-mono text-xs">{vehicle.license_plate || "No Plate"}</Badge>
                                        <span className="text-muted-foreground">|</span>
                                        <span className="text-sm text-muted-foreground font-mono">{vehicle.vin || "No VIN"}</span>
                                        {vehicle.is_high_risk && (
                                            <>
                                                <span className="text-muted-foreground">|</span>
                                                <Badge variant="danger" className="animate-pulse">HIGH RISK</Badge>
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-8">
                                    <DataField
                                        label="Color"
                                        value={

                                            (vehicle as any).exterior_color ? (
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-4 h-4 rounded-full border border-border shadow-sm shrink-0"
                                                        style={{

                                                            backgroundColor: (vehicle as any).exterior_color
                                                        }}
                                                    />

                                                    <span className="truncate">{(vehicle as any).exterior_color}</span>
                                                </div>
                                            ) : "-"
                                        }
                                        icon={null}
                                    />
                                    <DataField
                                        label="Health Score"
                                        value={
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${vehicle.health_score && vehicle.health_score < 50 ? 'text-destructive' : vehicle.health_score && vehicle.health_score < 80 ? 'text-warning' : 'text-success'}`}>
                                                    {vehicle.health_score || 100}%
                                                </span>
                                            </div>
                                        }
                                        icon={HeartPulse}
                                    />
                                    <DataField
                                        label="Total Repair Cost"
                                        value={formatCurrency(Number(vehicle.total_maintenance_cost || 0))}
                                        icon={DollarSign}
                                    />
                                    <DataField
                                        label="Mileage"
                                        value={
                                            vehicle.current_mileage != null
                                                ? `${Number(vehicle.current_mileage).toLocaleString()} ${vehicle.mileage_unit === "km" ? "km" : "mi"}`
                                                : "-"
                                        }
                                        icon={Gauge}
                                    />
                                    <DataField
                                        label="Engine"
                                        value={
                                            vehicle.engine_size ||
                                            vinData?.engine_model ||
                                            (vehicle.engine_type || "").replace(/_/g, " ") ||
                                            "-"
                                        }
                                        icon={Cog}
                                    />
                                    <DataField
                                        label="Fuel Type"
                                        value={
                                            vinData?.fuel_type_primary ||
                                            (vehicle.engine_type || "").replace(/_/g, " ") ||
                                            "-"
                                        }
                                        icon={Fuel}
                                    />
                                    <DataField
                                        label="Transmission"
                                        value={
                                            (vehicle.transmission_type || "").replace(/_/g, " ") ||
                                            vinData?.transmission_style ||
                                            "-"
                                        }
                                        icon={Activity}
                                    />
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Detailed Specs Tabs */}
                    <Card>
                        <CardHeader className="py-3 px-6 border-b bg-muted/30 flex flex-row items-center justify-between gap-3 space-y-0">
                            <div>
                                <CardTitle className="text-sm font-semibold">Technical Specifications</CardTitle>
                                <CardDescription className="text-xs mt-0.5">
                                    {vinData
                                        ? "Saved vehicle fields plus VIN-decoded details."
                                        : ""}
                                </CardDescription>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 shrink-0 text-xs"
                                disabled={!canDecodeVin || decodeSpecsMutation.isPending}
                                onClick={() => decodeSpecsMutation.mutate()}
                                title={canDecodeVin ? "Fetch specs from NHTSA and save" : "Needs a valid 17-character VIN"}
                            >
                                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${decodeSpecsMutation.isPending ? "animate-spin" : ""}`} />
                                {decodeSpecsMutation.isPending ? "Decoding…" : vinData ? "Refresh VIN specs" : "Decode VIN specs"}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Tabs defaultValue="overview" className="w-full">
                                <TabsList className="w-full justify-start rounded-none border-b h-11 px-4 bg-transparent">
                                    <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4">Overview</TabsTrigger>
                                    <TabsTrigger value="engine" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4">Engine & Trans</TabsTrigger>
                                    <TabsTrigger value="safety" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-10 px-4">Safety</TabsTrigger>
                                </TabsList>
                                <div className="p-6">
                                    <TabsContent value="overview" className="mt-0 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                                            <DataField label="Trim" value={vehicle.trim || vinData?.trim} />
                                            <DataField label="Series" value={vinData?.series} />
                                            <DataField label="Body Class" value={vinData?.body_class || vehicle.vehicle_type} />
                                            <DataField label="Interior Color" value={vehicle.interior_color} />
                                            <DataField label="Tire Size" value={vehicle.tire_size} />
                                            <DataField
                                                label="Fuel Tank"
                                                value={
                                                    vehicle.fuel_tank_capacity != null && vehicle.fuel_tank_capacity !== ""
                                                        ? String(vehicle.fuel_tank_capacity)
                                                        : null
                                                }
                                            />
                                            <DataField label="GVWR" value={vinData?.gvwr} />
                                            <DataField label="Doors" value={vinData?.doors} />
                                            <DataField label="Manufacturer" value={vinData?.manufacturer} />
                                            <DataField label="Plant" value={`${vinData?.plant_city || ""} ${vinData?.plant_country || ""}`.trim()} />
                                            <DataField label="Drive" value={vinData?.drive_type} />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="engine" className="mt-0 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                                            <DataField
                                                label="Engine Type"
                                                value={(vehicle.engine_type || "").replace(/_/g, " ")}
                                            />
                                            <DataField
                                                label="Engine Size"
                                                value={
                                                    vehicle.engine_size ||
                                                    (vinData?.engine_displacement_l
                                                        ? `${vinData.engine_displacement_l}L`
                                                        : vinData?.DisplacementL)
                                                }
                                            />
                                            <DataField label="Cylinders" value={vinData?.engine_cylinders} />
                                            <DataField label="Horsepower" value={vinData?.engine_hp} />
                                            <DataField label="Configuration" value={vinData?.engine_configuration} />
                                            <DataField
                                                label="Transmission"
                                                value={
                                                    (vehicle.transmission_type || "").replace(/_/g, " ") ||
                                                    vinData?.transmission_style
                                                }
                                            />
                                            <DataField label="Transmission Style" value={vinData?.transmission_style} />
                                            <DataField label="Trans Speeds" value={vinData?.transmission_speeds} />
                                        </div>
                                    </TabsContent>
                                    <TabsContent value="safety" className="mt-0 space-y-6">
                                        {vinData ? (
                                            <>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                                                    <DataField label="Front Airbags" value={vinData.airbag_front} />
                                                    <DataField label="Side Airbags" value={vinData.airbag_side} />
                                                    <DataField label="Curtain Airbags" value={vinData.airbag_curtain} />
                                                    <DataField label="Knee Airbags" value={vinData.airbag_knee} />
                                                </div>
                                                {vinData.other_restraint_info && (
                                                    <div className="mt-4 pt-4 border-t border-dashed">
                                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Other Restraint Info</span>
                                                        <p className="text-sm text-foreground mt-1">{vinData.other_restraint_info}</p>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-muted-foreground text-sm">No safety data available.</p>
                                        )}
                                    </TabsContent>
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar (4/12) */}
                <div className="lg:col-span-4 space-y-6">

                    {/* Owner Card */}
                    <Card>
                        <CardHeader className="py-3 px-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-foreground">Owner</CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setShowOwnershipHistory(true)}
                            >
                                <History className="w-3 h-3 mr-1" />
                                History
                            </Button>
                        </CardHeader>
                        <CardContent className="p-4">
                            {vehicle.owner ? (
                                <Link href={`/customers/${typeof vehicle.owner === 'object' ? vehicle.owner.id : vehicle.owner}`}>
                                    <div className="flex items-center space-x-3 group hover:bg-muted p-2 -m-2 rounded-md transition-colors">
                                        <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center text-primary font-semibold text-sm">
                                            {vehicle.owner_name?.charAt(0) || <User className="w-5 h-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                                    {vehicle.owner_name}
                                                </p>
                                                {vehicle.relationship && (
                                                    <Badge variant="outline" className="text-[9px] h-4 py-0 leading-none bg-muted/50 border-border/50 font-bold uppercase tracking-tight text-muted-foreground">
                                                        {vehicle.relationship.replace(/_/g, " ")}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground flex items-center mt-0.5">
                                                View Profile <ArrowUpRight className="w-3 h-3 ml-1" />
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            ) : (
                                <div className="text-sm text-muted-foreground italic">No owner assigned</div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Stats Card */}
                    <Card>
                        <CardHeader className="py-3 px-4 border-b bg-muted/30">
                            <CardTitle className="text-sm font-semibold text-foreground">Vehicle Statistics</CardTitle>
                        </CardHeader>
                        <CardContent className="px-0 py-2">
                            <div className="divide-y text-sm">
                                <div className="px-4 py-3 flex justify-between items-center">
                                    <span className="text-muted-foreground">Total Invoiced</span>
                                    <span className="font-semibold">{formatCurrency(totalSpent)}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between items-center">
                                    <span className="text-muted-foreground">Total Services</span>
                                    <span className="font-medium">{totalServices}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between items-center">
                                    <span className="text-muted-foreground">Appointments</span>
                                    <span className="font-medium">{vehicleAppointments.length}</span>
                                </div>
                                <div className="px-4 py-3 flex justify-between items-center">
                                    <span className="text-muted-foreground">Last Service</span>
                                    <span className="font-medium text-foreground">
                                        {lastServiceDate ? format(new Date(lastServiceDate), "MMM dd, yyyy") : "-"}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <Card>
                        <CardContent className="p-4 space-y-3">
                            <Link href={`/appointments/new?vehicle=${vehicle.id}`} className="block">
                                <Button variant="outline" className="w-full justify-start h-9">
                                    <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                                    Schedule Service
                                </Button>
                            </Link>
                            <Link href={`/workorders/new?vehicle=${vehicle.id}`} className="block">
                                <Button className="w-full justify-start h-9 shadow-sm">
                                    <FileText className="w-4 h-4 mr-2" />
                                    New Work Order
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>

                </div>
            </div>

            {/* Image Modal */}
            <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
                <DialogContent
                    className="!max-w-none !w-screen !h-screen !m-0 !p-0 bg-transparent/80 border-none shadow-none flex justify-center items-center cursor-pointer"
                    onClick={() => setShowImageModal(false)}
                >
                    <div className="relative w-[95vw] h-[85vh] flex items-center justify-center pointer-events-none">
                        {vehicle.image && (
                            <Image
                                src={getMediaUrl(vehicle.image)}
                                alt="Vehicle Full Size"
                                fill
                                className="object-contain pointer-events-auto cursor-default"
                                unoptimized={vehicle.image.startsWith("http") || !vehicle.image.startsWith("http")}
                                priority
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Ownership History Dialog */}
            <Dialog open={showOwnershipHistory} onOpenChange={setShowOwnershipHistory}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <CardHeader className="px-0 pt-0">
                        <CardTitle className="text-lg">Ownership History</CardTitle>
                    </CardHeader>
                    {ownershipHistory && ownershipHistory.results.length > 0 ? (
                        <div className="space-y-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Transfer Date</TableHead>
                                        <TableHead>Previous Owner</TableHead>
                                        <TableHead>New Owner</TableHead>
                                        <TableHead>Transferred By</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {ownershipHistory.results.map((record) => (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-medium">
                                                {format(new Date(record.transfer_date), "MMM dd, yyyy")}
                                            </TableCell>
                                            <TableCell>
                                                {record.previous_owner_name}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                                    <span className="font-medium">{record.new_owner_name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {record.transferred_by_name}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                                {record.notes || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <History className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                            <p>No ownership history available</p>
                            <p className="text-sm mt-1">This vehicle has not been transferred to a new owner yet.</p>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
