"use client";

import React, { memo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  History, 
  Wrench, 
  Calendar,
  Car
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { getMediaUrl } from "@/lib/api/utils";

interface VehicleTableProps {
  vehicles: any[];
  onDelete?: (vehicle: any) => void;
  sortConfig: any;
  onSort: (field: string) => void;
}

const VehicleRow = memo(function VehicleRow({ 
  vehicle, 
  router,
  onDelete
}: { 
  vehicle: any; 
  router: any;
  onDelete?: (vehicle: any) => void;
}) {
  const avatarColors = [
    "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  ];
  
  const colorIndex = vehicle.id % avatarColors.length;
  const initials = (vehicle.make?.substring(0, 1) || "") + (vehicle.model?.substring(0, 1) || "");

  return (
    <TableRow className="group hover:bg-muted/50 transition-colors border-border/50">
      <TableCell className="py-3" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold tracking-tighter shadow-sm overflow-hidden",
            !vehicle.image && avatarColors[colorIndex]
          )}>
            {vehicle.image ? (
              <img 
                src={getMediaUrl(vehicle.image)} 
                alt={`${vehicle.make} ${vehicle.model}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = ""; // Clear src to stop retry
                  target.classList.add("hidden");
                  // Add back the avatar color to the parent div
                  const parent = target.parentElement;
                  if (parent) {
                    avatarColors.forEach(c => parent.classList.remove(...c.split(" ")));
                    parent.classList.add(...avatarColors[colorIndex].split(" "));
                  }
                }}
              />
            ) : (
              initials || <Car className="w-4 h-4" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
              {vehicle.make} {vehicle.model}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {vehicle.license_plate || vehicle.vin?.substring(0, 8) || "NO PLATE"}
            </span>
            {vehicle.is_high_risk && (
              <Badge variant="danger" className="mt-1 w-fit text-[8px] h-4 px-1 py-0 leading-none">
                HIGH RISK
              </Badge>
            )}
          </div>
        </div>
      </TableCell>
      
      <TableCell className="text-xs font-mono text-muted-foreground" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        {vehicle.vin || "-"}
      </TableCell>
      
      <TableCell className="text-sm text-muted-foreground" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        <div className="flex flex-col">
          <span>{(vehicle as any).owner_name || (typeof vehicle.owner === "object" ? `${(vehicle.owner as any).user?.first_name || ""} ${(vehicle.owner as any).user?.last_name || ""}`.trim() : "-") || "-"}</span>
          {vehicle.relationship && (
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
              {vehicle.relationship.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </TableCell>
      
      <TableCell onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            vehicle.status === "active" ? "bg-emerald-500" : 
            vehicle.status === "in_service" ? "bg-amber-500" : "bg-gray-300"
          )} />
          <Badge 
            variant="outline" 
            className={cn(
              "text-[9px] font-black uppercase tracking-widest border-none shadow-none p-0",
              vehicle.status === "active" ? "text-emerald-600" : 
              vehicle.status === "in_service" ? "text-amber-600" : "text-gray-400"
            )}
          >
            {vehicle.status?.replace(/_/g, " ") || "Active"}
          </Badge>
        </div>
      </TableCell>
      
      <TableCell className="text-right text-sm text-muted-foreground" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        {vehicle.year || "-"}
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/vehicles/${vehicle.id}`); }}>
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </DropdownMenuItem>
            
            <PermissionGuard permission="edit_vehicles">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/vehicles/${vehicle.id}/edit`); }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Vehicle
              </DropdownMenuItem>
            </PermissionGuard>
            
            <PermissionGuard permission="view_service_history">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/vehicles/${vehicle.id}?view=history`); }}>
                <History className="w-4 h-4 mr-2" />
                Service History
              </DropdownMenuItem>
            </PermissionGuard>
            
            <DropdownMenuSeparator />
            
            <PermissionGuard permission="create_work_orders">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/workorders/new?vehicle=${vehicle.id}`); }}>
                <Wrench className="w-4 h-4 mr-2" />
                New Work Order
              </DropdownMenuItem>
            </PermissionGuard>
            
            <PermissionGuard permission="create_appointments">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/appointments/new?vehicle=${vehicle.id}`); }}>
                <Calendar className="w-4 h-4 mr-2" />
                New Appointment
              </DropdownMenuItem>
            </PermissionGuard>
            
            <DropdownMenuSeparator />
            
            <PermissionGuard permission="delete_vehicles">
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDelete?.(vehicle); }}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Vehicle
              </DropdownMenuItem>
            </PermissionGuard>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export function VehicleTable({ vehicles, onDelete, sortConfig, onSort }: VehicleTableProps) {
  const router = useRouter();

  return (
    <div className="precision-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border/50">
            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">Vehicle</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">VIN</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">Owner</TableHead>
            <TableHead className="text-[10px] font-black uppercase tracking-widest h-10">Status</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase tracking-widest h-10">Year</TableHead>
            <TableHead className="text-right text-[10px] font-black uppercase tracking-widest h-10">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                No vehicles found.
              </TableCell>
            </TableRow>
          ) : (
            vehicles.map((vehicle) => (
              <VehicleRow 
                key={vehicle.id} 
                vehicle={vehicle} 
                router={router}
                onDelete={onDelete}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
