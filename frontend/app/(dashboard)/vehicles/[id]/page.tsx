"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Edit, Car, Calendar, Gauge, Fuel, FileText, AlertCircle, X, Truck } from "lucide-react";
import Link from "next/link";
import { roadsideApi } from "@/lib/api/roadside";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import Image from "next/image";
import { useState } from "react";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function VehicleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vehicleId = parseInt(params.id as string);

  const { data: vehicle, isLoading, error } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
  });

  // Fetch work orders and appointments for this vehicle
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "vehicle", vehicleId],
    queryFn: () => workordersApi.list(),
    enabled: !!vehicleId,
  });

  const { data: appointmentsData } = useQuery({
    queryKey: ["appointments", "vehicle", vehicleId],
    queryFn: () => appointmentsApi.list(),
    enabled: !!vehicleId,
  });

  const [showImageModal, setShowImageModal] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: roadsideRequestsData } = useQuery({
    queryKey: ["roadside", "vehicle", vehicleId],
    queryFn: () => roadsideApi.list({ vehicle: vehicleId }),
    enabled: !!vehicleId,
  });

  const roadsideRequests = roadsideRequestsData?.results || [];

  // Filter work orders and appointments for this vehicle
  const vehicleWorkOrders =
    workOrdersData?.results?.filter(
      (wo) =>
        (typeof wo.vehicle === "object" && wo.vehicle !== null
          ? wo.vehicle.id
          : wo.vehicle) === vehicleId
    ) || [];

  const vehicleAppointments =
    appointmentsData?.results?.filter(
      (apt) =>
        (typeof apt.vehicle === "object" && apt.vehicle !== null
          ? apt.vehicle.id
          : apt.vehicle) === vehicleId
    ) || [];

  // Calculate stats
  const totalServices = vehicleWorkOrders.length;
  const totalSpent = vehicleWorkOrders.reduce((sum, wo) => {
    const cost = wo.total_cost ? parseFloat(wo.total_cost.toString()) : 0;
    return sum + cost;
  }, 0);

  const completedWorkOrders = vehicleWorkOrders.filter((wo) => wo.status === "completed");
  const lastServiceDate = completedWorkOrders.length > 0
    ? completedWorkOrders.sort((a, b) =>
      new Date(b.completed_at || b.created_at).getTime() -
      new Date(a.completed_at || a.created_at).getTime()
    )[0]?.completed_at || completedWorkOrders[0]?.created_at
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Error loading vehicle. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const vinData = (vehicle as any)?.vin_decoded_data || null;

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "in_service":
        return "warning";
      case "sold":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="secondary" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              VIN: {vehicle.vin}
            </p>
          </div>
        </div>
        <PermissionGuard permission="edit_vehicles">
          <Link href={`/vehicles/${vehicleId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Vehicle
            </Button>
          </Link>
        </PermissionGuard>

      </div>

      {/* Status Badge */}
      <div>
        <Badge variant={getStatusVariant(vehicle.status) as any} className="text-sm px-3 py-1">
          {vehicle.status?.replace("_", " ") || vehicle.status}
        </Badge>
      </div>


      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="roadside">Roadside Assistance ({roadsideRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Vehicle Info */}
            <div className="lg:col-span-3 space-y-6">
              {/* Vehicle Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Left Column - Vehicle Image */}
                    {vehicle.image && (
                      <div className="flex-shrink-0">
                        <div
                          className="w-40 cursor-pointer"
                          onClick={() => setShowImageModal(true)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && setShowImageModal(true)}
                        >
                          <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                            <Image
                              src={vehicle.image!}
                              alt={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
                              fill
                              className="object-cover"
                              sizes="160px"
                              unoptimized={
                                vehicle.image?.startsWith("http://localhost") ||
                                vehicle.image?.startsWith("https://localhost")
                              }
                            />
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">Click to enlarge</p>
                        </div>
                      </div>
                    )}

                    {/* Right Column - Vehicle Information */}
                    <div className="flex-1">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Make</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.make || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Model</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.model || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Year</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.year || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">License Plate</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicle.license_plate || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">VIN</p>
                          <div className="bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-mono text-gray-900 dark:text-gray-100">{vehicle.vin || "-"}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase">Color</p>
                          <div className="flex items-center gap-2">
                            {(vehicle as any).exterior_color && (
                              <>
                                <div
                                  className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600"
                                  style={{ backgroundColor: (vehicle as any).exterior_color }}
                                />
                                <p className="text-sm font-mono text-gray-900 dark:text-gray-100">{(vehicle as any).exterior_color}</p>
                              </>
                            )}
                            {!(vehicle as any).exterior_color && (
                              <p className="text-sm text-gray-900 dark:text-gray-100">-</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Other Information (VIN decoded) */}
              {vinData && (
                <Card>
                  <CardHeader>
                    <CardTitle>Other Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Series:</span> {vinData.series || "-"}</div>
                      <div><span className="text-gray-500">Trim:</span> {vinData.trim || "-"}</div>
                      <div><span className="text-gray-500">GVWR:</span> {vinData.gvwr || "-"}</div>
                      <div><span className="text-gray-500">Drive Type:</span> {vinData.drive_type || "-"}</div>
                      <div><span className="text-gray-500">Cylinders:</span> {vinData.engine_cylinders ?? "-"}</div>
                      <div><span className="text-gray-500">Engine Displacement (L):</span> {vinData.engine_displacement_l || vinData.DisplacementL || "-"}</div>
                      <div><span className="text-gray-500">Primary Fuel Type:</span> {vinData.fuel_type_primary || "-"}</div>
                      <div><span className="text-gray-500">Secondary Fuel Type:</span> {vinData.fuel_type_secondary || "-"}</div>
                      <div><span className="text-gray-500">Electrification Level:</span> {vinData.electrification_level || "-"}</div>
                      <div><span className="text-gray-500">Engine Model:</span> {vinData.engine_model || "-"}</div>
                      <div><span className="text-gray-500">Engine HP:</span> {vinData.engine_hp ?? "-"}</div>
                      <div><span className="text-gray-500">Engine Manufacturer:</span> {vinData.engine_manufacturer || "-"}</div>
                      <div><span className="text-gray-500">Transmission Speed:</span> {vinData.transmission_speeds || "-"}</div>
                      <div><span className="text-gray-500">Transmission Style:</span> {vinData.transmission_style || "-"}</div>
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Airbags</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div><span className="text-gray-500">Front:</span> {vinData.airbag_front || "-"}</div>
                        <div><span className="text-gray-500">Knee:</span> {vinData.airbag_knee || "-"}</div>
                        <div><span className="text-gray-500">Side:</span> {vinData.airbag_side || "-"}</div>
                        <div><span className="text-gray-500">Curtain:</span> {vinData.airbag_curtain || "-"}</div>
                        <div><span className="text-gray-500">Seat Cushion:</span> {vinData.airbag_seat_cushion || "-"}</div>
                      </div>
                      {vinData.other_restraint_info && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Other Restraint Info: {vinData.other_restraint_info}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Specifications and Service History - Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Specifications */}
                <Card>
                  <CardHeader>
                    <CardTitle>Specifications</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <Gauge className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Mileage</p>
                        <p className="text-gray-900 dark:text-gray-100">
                          {(vehicle as any).current_mileage ? `${((vehicle as any).current_mileage).toLocaleString()} miles` : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <Fuel className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Engine Type</p>
                        <p className="text-gray-900 dark:text-gray-100 capitalize">{((vehicle as any).engine_type || "-").replace("_", " ")}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Service History */}
                <Card>
                  <CardHeader>
                    <CardTitle>Service History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Link href={`/vehicles/${vehicleId}/history`}>
                      <Button>
                        <FileText className="w-4 h-4 mr-2" />
                        View Full History
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Service History with Repeat Visit Highlights */}
              {vehicleWorkOrders.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Service History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {vehicleWorkOrders
                        .sort((a, b) =>
                          new Date(b.completed_at || b.created_at).getTime() -
                          new Date(a.completed_at || a.created_at).getTime()
                        )
                        .slice(0, 10)
                        .map((wo, index) => {
                          const completedDate = wo.completed_at || wo.created_at;
                          const isRecent = completedDate &&
                            (new Date().getTime() - new Date(completedDate).getTime()) < (30 * 24 * 60 * 60 * 1000);
                          const isWarrantyRework = (wo as any).is_warranty_rework;
                          const hasRelated = (wo as any).related_work_order_detail;

                          return (
                            <div
                              key={wo.id}
                              className={`p-3 rounded-md border ${isWarrantyRework || hasRelated
                                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                                : isRecent
                                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    <Link
                                      href={`/workorders/${wo.id}`}
                                      className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      {wo.work_order_number}
                                    </Link>
                                    {isWarrantyRework && (
                                      <Badge variant="warning" className="text-xs">
                                        <AlertCircle className="w-3 h-3 mr-1" />
                                        Warranty Rework
                                      </Badge>
                                    )}
                                    {hasRelated && !isWarrantyRework && (
                                      <Badge className="text-xs border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 bg-transparent">
                                        Related
                                      </Badge>
                                    )}
                                    {isRecent && !isWarrantyRework && !hasRelated && (
                                      <Badge variant="info" className="text-xs">
                                        Recent
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                    {completedDate
                                      ? format(new Date(completedDate), "MMM dd, yyyy")
                                      : format(new Date(wo.created_at), "MMM dd, yyyy")}
                                    {completedDate && isRecent && (
                                      <span className="ml-2">
                                        ({Math.floor((new Date().getTime() - new Date(completedDate).getTime()) / (24 * 60 * 60 * 1000))} days ago)
                                      </span>
                                    )}
                                  </p>
                                  {wo.customer_concerns && (
                                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mt-1">
                                      {wo.customer_concerns.substring(0, 100)}
                                      {wo.customer_concerns.length > 100 ? '...' : ''}
                                    </p>
                                  )}
                                  <div className="flex items-center space-x-3 mt-2">
                                    <Badge variant={wo.status === 'completed' || wo.status === 'closed' ? 'success' : 'default'} className="text-xs capitalize">
                                      {wo.status.replace("_", " ")}
                                    </Badge>
                                    {wo.total_cost && (
                                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                        ${parseFloat(wo.total_cost.toString()).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    {vehicleWorkOrders.length > 10 && (
                      <div className="mt-4 text-center">
                        <Link href={`/vehicles/${vehicleId}/history`}>
                          <Button variant="secondary" size="sm">
                            View All {vehicleWorkOrders.length} Work Orders
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Quick Info */}
            <div className="space-y-3">
              {/* Owner Information */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Owner</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {vehicle.owner ? (
                    <Link
                      href={`/customers/${typeof vehicle.owner === 'object' && vehicle.owner !== null ? vehicle.owner.id : vehicle.owner}`}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                    >
                      {vehicle.owner_name || "View Customer"}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-gray-100">-</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Total Services</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{totalServices}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Appointments</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{vehicleAppointments.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Last Service</span>
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {lastServiceDate
                        ? format(new Date(lastServiceDate), "MMM dd, yyyy")
                        : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Total Spent</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">${totalSpent.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader className="pb-2">
                  {/* <CardTitle className="text-base">Quick Actions</CardTitle> */}
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  <Link href={`/appointments/new?vehicle=${vehicleId}`} className="block">
                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-8">
                      <Calendar className="w-3 h-3 mr-1.5" />
                      Schedule Service
                    </Button>
                  </Link>
                  <Link href={`/workorders/new?vehicle=${vehicleId}`} className="block">
                    <Button variant="secondary" size="sm" className="w-full justify-start text-xs h-8">
                      <FileText className="w-3 h-3 mr-1.5" />
                      Create Work Order
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="roadside">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Roadside Assistance History</CardTitle>
                <Link href="/portal/roadside/new">
                  <Button size="sm">
                    <Truck className="w-4 h-4 mr-2" />
                    New Request
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {roadsideRequests.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request #</TableHead>
                      <TableHead>Service Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roadsideRequests.map((req: any) => (
                      <TableRow key={req.id}>
                        <TableCell className="font-medium font-mono">{req.request_number}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            {req.service_type_display || req.service_type}
                            {req.is_covered_by_subscription && (
                              <Badge variant="success" className="ml-2 text-[10px] h-5 px-1 py-0">Covered</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={req.status === 'completed' ? 'success' : req.status === 'cancelled' ? 'secondary' : 'default'}>
                            {req.status_display || req.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(req.requested_at), "MMM dd, yyyy HH:mm")}</TableCell>
                        <TableCell>{req.assigned_technician_name || "-"}</TableCell>
                        <TableCell>
                          <Link href={`/roadside/${req.id}`}>
                            <Button variant="ghost" size="sm">View</Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No roadside requests found</p>
                  <p className="text-sm mt-1">This vehicle hasn't requested any roadside assistance yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Image Dialog - Root level for proper modal rendering */}
      {
        vehicle.image && (
          <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
            <DialogContent className="!max-w-[60vw] !w-[60vw] !h-[60vh] !p-0 !mx-0 max-h-[60vh]">
              <div className="relative w-full h-full min-h-0 rounded-lg overflow-hidden bg-black flex items-center justify-center">
                <Image
                  src={vehicle.image!}
                  alt={`${vehicle.make} ${vehicle.model} ${vehicle.year}`}
                  fill
                  className="object-contain"
                  sizes="60vw"
                  priority
                  unoptimized={
                    vehicle.image?.startsWith("http://localhost") ||
                    vehicle.image?.startsWith("https://localhost")
                  }
                />
              </div>
            </DialogContent>
          </Dialog>
        )
      }
    </div >
  );
}

