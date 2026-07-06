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
  Wrench, 
  Calendar,
  Car,
  AlertTriangle,
  Clock,
  Gauge
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
import { format } from "date-fns";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";

interface ServiceDueTableProps {
  vehicles: any[];
  sortConfig: SortConfig | null;
  onSort: (field: string) => void;
}

const headerClass = "text-[10px] font-black uppercase tracking-widest h-10";

const ServiceDueRow = memo(function ServiceDueRow({ 
  vehicle, 
  router 
}: { 
  vehicle: any; 
  router: any;
}) {
  const avatarColors = [
    "bg-red-100 text-destructive dark:bg-red-900/30 dark:text-red-400",
    "bg-orange-100 text-warning dark:bg-orange-900/30 dark:text-orange-400",
  ];
  
  const colorIndex = vehicle.id % avatarColors.length;
  const initials = (vehicle.make?.substring(0, 1) || "") + (vehicle.model?.substring(0, 1) || "");

  // Determine if it's "Urgent" (Next due date is today or past, or mileage is over)
  const isOverdue = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (vehicle.next_service_due_date && new Date(vehicle.next_service_due_date) < today) return true;
    // We don't have the specific schedule mileage here easily without more API data, 
    // but the backend filter ensures these are actually due.
    return false;
  }, [vehicle]);

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
                  target.src = "";
                  target.classList.add("hidden");
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
      
      <TableCell onClick={() => router.push(`/vehicles/${vehicle.id}?view=services`)}>
        <div className="flex items-center gap-2">
            <AlertTriangle className={cn("w-3.5 h-3.5", isOverdue ? "text-destructive" : "text-warning")} />
            <span className={cn("text-xs font-bold uppercase tracking-tight", isOverdue ? "text-destructive dark:text-red-400" : "text-warning dark:text-amber-400")}>
                {vehicle.due_service_name || "General Service"}
            </span>
        </div>
      </TableCell>
      
      <TableCell onClick={() => router.push(`/vehicles/${vehicle.id}?view=services`)}>
        <div className="space-y-1">
            {vehicle.next_service_due_date && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Due: {format(new Date(vehicle.next_service_due_date), "MMM dd, yyyy")}
                </div>
            )}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Gauge className="w-3 h-3" />
                Mileage: {vehicle.current_mileage?.toLocaleString() || "0"} mi
            </div>
        </div>
      </TableCell>
      
      <TableCell className="text-sm text-muted-foreground" onClick={() => router.push(`/vehicles/${vehicle.id}`)}>
        {vehicle.owner_name || "-"}
      </TableCell>
      
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/vehicles/${vehicle.id}?view=services`); }}>
              <Eye className="w-4 h-4 mr-2" />
              View Schedule
            </DropdownMenuItem>
            
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
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export function ServiceDueTable({ vehicles, sortConfig, onSort }: ServiceDueTableProps) {
  const router = useRouter();

  return (
    <div className="precision-card overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="hover:bg-transparent border-border/50">
            <SortableHeader field="make" sortConfig={sortConfig} onSort={onSort} className={headerClass}>
              Vehicle
            </SortableHeader>
            <TableHead className={headerClass}>Services Due</TableHead>
            <SortableHeader field="service_schedules__next_service_due_date" sortConfig={sortConfig} onSort={onSort} className={headerClass}>
              Schedule Detail
            </SortableHeader>
            <SortableHeader field="owner__user__last_name" sortConfig={sortConfig} onSort={onSort} className={headerClass}>
              Owner
            </SortableHeader>
            <TableHead className="text-right text-[10px] font-black uppercase tracking-widest h-10">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center text-muted-foreground italic text-sm">
                No services due based on current maintenance schedules.
              </TableCell>
            </TableRow>
          ) : (
            vehicles.map((vehicle) => (
              <ServiceDueRow 
                key={vehicle.id} 
                vehicle={vehicle} 
                router={router}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
