"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { memo } from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CustomerTableProps {
  customers: any[];
  isLoading: boolean;
  formatCurrency: (amount: number) => string;
  onDelete?: (customer: any) => void;
}

const CustomerRow = memo(function CustomerRow({
  customer,
  formatCurrency,
  router,
  onDelete
}: {
  customer: any;
  formatCurrency: any;
  router: any;
  onDelete?: (customer: any) => void;
}) {
  const displayName = customer.company_name || customer.full_name;
  const initials = displayName
    ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : customer.email?.[0].toUpperCase() || "C";

  const avatarColors = [
    "bg-blue-100 text-primary dark:bg-blue-900/30 dark:text-blue-400",
    "bg-orange-100 text-warning dark:bg-orange-900/30 dark:text-orange-400",
    "bg-emerald-100 text-success dark:bg-emerald-900/30 dark:text-emerald-400",
    "bg-purple-100 text-primary dark:bg-purple-900/30 dark:text-purple-400",
  ];

  const colorIndex = customer.id % avatarColors.length;

  return (
    <TableRow className="group hover:bg-muted/50 cursor-pointer transition-colors">
      <TableCell className="py-4" onClick={() => router.push(`/customers/${customer.id}`)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs", avatarColors[colorIndex])}>
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-foreground leading-none mb-1 group-hover:text-primary transition-colors">
              {displayName}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground" onClick={() => router.push(`/customers/${customer.id}`)}>
        {customer.email}
      </TableCell>

      <TableCell onClick={() => router.push(`/customers/${customer.id}`)}>
        <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-muted-foreground/20 text-muted-foreground">
          {customer.customer_type || "Individual"}
        </Badge>
      </TableCell>

      <TableCell className="text-right font-bold text-sm" onClick={() => router.push(`/customers/${customer.id}`)}>
        <span className={cn(
          parseFloat(customer.current_balance) > 1000 ? "text-warning" : "text-foreground"
        )}>
          {formatCurrency(parseFloat(customer.current_balance || "0"))}
        </span>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground" onClick={() => router.push(`/customers/${customer.id}`)}>
        {customer.last_visit_date ? new Date(customer.last_visit_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: '2-digit' }) : "N/A"}
      </TableCell>

      <TableCell onClick={() => router.push(`/customers/${customer.id}`)}>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full",
            customer.status === "active" ? "bg-success/100" : "bg-gray-300"
          )} />
          <Badge
            variant="outline"
            className={cn(
              "text-[9px] font-black uppercase tracking-widest border-none shadow-none p-0",
              customer.status === "active" ? "text-success" : "text-gray-400"
            )}
          >
            {customer.status || "Active"}
          </Badge>
        </div>
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/customers/${customer.id}`);
              }}
            >
              View Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/customers/${customer.id}/edit`);
              }}
            >
              Edit Customer
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/customers/${customer.id}#notes`);
              }}
            >
              Add Note
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/sms?recipient_id=${customer.user?.id}&recipient_name=${encodeURIComponent(customer.full_name || customer.company_name || '')}&phone=${customer.user?.phone || ''}`);
              }}
            >
              Send SMS
            </DropdownMenuItem>

            <div className="h-px bg-muted my-1" />

            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/vehicles/new?customer=${customer.id}`);
              }}
            >
              New Vehicle
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/workorders/new?customer=${customer.id}`);
              }}
            >
              New Work Order
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/appointments/new?customer=${customer.id}`);
              }}
            >
              New Appointment
            </DropdownMenuItem>

            <div className="h-px bg-muted my-1" />

            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(customer);
              }}
              className="text-destructive focus:text-destructive"
            >
              Delete Customer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export function CustomerTable({ customers, isLoading, formatCurrency, onDelete }: CustomerTableProps) {
  const router = useRouter();

  return (
    <div className="precision-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent border-b border-border bg-muted/30">
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4">Customer Name</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4">Email</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4">Type</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4 text-right">Balance</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4">Last Visit</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4">Status</TableHead>
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground py-4 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j} className="py-4">
                    <div className="h-4 bg-muted animate-pulse rounded" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No customers found.
              </TableCell>
            </TableRow>
          ) : (
            customers.map((customer) => (
              <CustomerRow
                key={customer.id}
                customer={customer}
                formatCurrency={formatCurrency}
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
