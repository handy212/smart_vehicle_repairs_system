"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Subscription, subscriptionsApi } from "@/lib/api/subscriptions";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { Download, User, Car, Calendar, CreditCard, Activity, CheckCircle2, AlertTriangle, XCircle, Clock, FileText, Wrench, Fuel, Key, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

interface SubscriptionDetailsDialogProps {
    subscription: Subscription | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SubscriptionDetailsDialog({ subscription, open, onOpenChange }: SubscriptionDetailsDialogProps) {
    const { formatCurrency } = useCurrency();

    const { data: usageHistory, isLoading: isLoadingUsage } = useQuery({
        queryKey: ["subscriptions", subscription?.id, "usage"],
        queryFn: () => subscriptionsApi.usage(subscription!.id),
        enabled: !!subscription && open,
    });

    if (!subscription) return null;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "active": return <CheckCircle2 className="w-4 h-4" />;
            case "expired": return <AlertTriangle className="w-4 h-4" />;
            case "cancelled": return <XCircle className="w-4 h-4" />;
            case "pending": return <Clock className="w-4 h-4" />;
            default: return null;
        }
    };

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "active": return "success";
            case "expired": return "danger";
            case "cancelled": return "secondary";
            case "pending": return "warning";
            default: return "outline";
        }
    };

    const labelMap: Record<string, string> = {
        roadside_first_aid: "Mech First Aid",
        towing_services_km: "Towing",
        emergency_fuel: "Fuel Delivery",
        key_lock_out: "Lock Out",
        extrication: "Extrication",
        accident_estimate: "Accident Estimate",
        pre_purchase_inspection: "Pre-Purchase Insp.",
        battery_boosts: "Battery Boost",
        flat_tyre_service: "Flat Tyre",
        total_service_calls: "Service Calls",
    };

    const iconMap: Record<string, React.ReactNode> = {
        roadside_first_aid: <Wrench className="w-3.5 h-3.5" />,
        towing_services_km: <Car className="w-3.5 h-3.5" />,
        emergency_fuel: <Fuel className="w-3.5 h-3.5" />,
        key_lock_out: <Key className="w-3.5 h-3.5" />,
        battery_boosts: <Zap className="w-3.5 h-3.5" />,
        default: <Shield className="w-3.5 h-3.5" />
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl p-0 gap-0 rounded-xl overflow-hidden shadow-2xl border-none">
                <DialogHeader className="p-5 bg-slate-50/50 border-b">
                    <div className="flex justify-between items-center pr-6">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "p-2 rounded-lg",
                                subscription.status === 'active' ? "bg-green-100 text-green-700" : "bg-slate-100 text-muted-foreground"
                            )}>
                                {getStatusIcon(subscription.status)}
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-foreground leading-tight">
                                    {subscription.package_name}
                                </DialogTitle>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                    <span className="font-mono font-medium">{subscription.subscription_number}</span>
                                    <span>•</span>
                                    <span>Member since {format(new Date(subscription.start_date), "MMM yyyy")}</span>
                                </div>
                            </div>
                        </div>
                        <Badge variant={getStatusVariant(subscription.status) as any} className="capitalize px-3 py-1">
                            {subscription.status}
                        </Badge>
                    </div>
                </DialogHeader>

                <div className="p-5 space-y-6 bg-card max-h-[70vh] overflow-y-auto">
                    {/* Primary Info Row */}
                    <div className="grid grid-cols-2 gap-8 px-2">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                <User className="w-3.5 h-3.5" />
                                Customer & Vehicle
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-muted-foreground font-bold border border-border text-xs">
                                    {subscription.customer_name?.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="font-bold text-foreground text-sm truncate">{subscription.customer_full_name}</div>
                                    <div className="text-[11px] text-muted-foreground font-mono">ID: {subscription.customer}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 py-1.5 px-2 bg-slate-50/80 rounded-lg border border-border">
                                <Car className="w-4 h-4 text-muted-foreground" />
                                <div className="min-w-0">
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase leading-none">Vehicle ID</div>
                                    <div className="text-[12px] font-mono font-medium text-foreground mt-0.5 truncate">{subscription.vehicle || 'N/A'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                <Calendar className="w-3.5 h-3.5" />
                                Subscription Period
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-[12px] text-muted-foreground">Period</span>
                                    <span className="text-[12px] font-semibold text-foreground">
                                        {format(new Date(subscription.start_date), "MMM dd")} - {format(new Date(subscription.end_date), "MMM dd, yyyy")}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center px-2 py-1 bg-slate-50 rounded-md">
                                    <span className="text-[12px] font-medium text-muted-foreground">Remaining</span>
                                    <span className={cn(
                                        "text-sm font-black",
                                        subscription.days_remaining && subscription.days_remaining < 30 ? "text-red-500" : "text-foreground"
                                    )}>
                                        {subscription.days_remaining} Days
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-[12px]">
                                    <span className="text-muted-foreground">Auto-Renew</span>
                                    <span className={cn("font-medium", subscription.auto_renew ? "text-success" : "text-muted-foreground")}>
                                        {subscription.auto_renew ? "On" : "Off"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="opacity-50" />

                    {/* Financials & Allowances Header */}
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                            <Activity className="w-3.5 h-3.5" />
                            Allowances & Usage
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-medium text-muted-foreground">Service Fee:</span>
                            <span className="text-sm font-black text-foreground">{formatCurrency(parseFloat(subscription.purchase_price))}</span>
                        </div>
                    </div>

                    {/* Allowances Compact Grid */}
                    {subscription.remaining_allowances && Object.keys(subscription.remaining_allowances).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 px-2">
                            {Object.entries(subscription.remaining_allowances).map(([key, value]) => (
                                <div key={key} className="p-2.5 bg-slate-50/50 rounded-lg border border-border hover:border-primary/30 transition-colors group">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1 rounded bg-card text-muted-foreground group-hover:text-primary transition-colors border border-border">
                                            {iconMap[key] || iconMap.default}
                                        </div>
                                        <div className="text-[16px] font-black text-foreground line-clamp-1">{value}</div>
                                    </div>
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground truncate leading-tight" title={labelMap[key] || key}>
                                        {labelMap[key] || key.replace(/_/g, " ")}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Usage History Section */}
                    <div className="space-y-2.5 pt-2">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                <FileText className="w-3.5 h-3.5" />
                                Recent Activity
                            </div>
                            {usageHistory && usageHistory.length > 0 && (
                                <span className="text-[10px] font-bold text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">{usageHistory.length} Total</span>
                            )}
                        </div>

                        <div className="border rounded-lg overflow-hidden bg-card">
                            {isLoadingUsage ? (
                                <div className="p-8 text-center text-muted-foreground text-xs">Loading history...</div>
                            ) : usageHistory && usageHistory.length > 0 ? (
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="h-9">
                                            <TableHead className="text-[11px] font-bold text-muted-foreground uppercase h-9">Date</TableHead>
                                            <TableHead className="text-[11px] font-bold text-muted-foreground uppercase h-9">Service</TableHead>
                                            <TableHead className="text-right text-[11px] font-bold text-muted-foreground uppercase h-9">Used</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {usageHistory.slice(0, 5).map((usage: any) => (
                                            <TableRow key={usage.id} className="hover:bg-slate-50/30 h-10 border-slate-50">
                                                <TableCell className="p-2 align-middle">
                                                    <div className="text-[11px] font-medium text-foreground">{format(new Date(usage.service_date), "MMM dd, yyyy")}</div>
                                                    <div className="text-[9px] text-muted-foreground">{format(new Date(usage.service_date), "h:mm a")}</div>
                                                </TableCell>
                                                <TableCell className="p-2 align-middle">
                                                    <div className="capitalize text-[11px] font-semibold text-foreground truncate max-w-[120px]">
                                                        {usage.usage_type?.replace(/_/g, " ")}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground">#{usage.reference_id || 'N/A'}</div>
                                                </TableCell>
                                                <TableCell className="p-2 align-middle text-right font-bold text-[11px] text-foreground">
                                                    -{usage.quantity_used}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-8 flex flex-col items-center justify-center text-center text-muted-foreground space-y-2">
                                    <FileText className="w-6 h-6 stroke-1" />
                                    <p className="text-[11px]">No services used yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t flex items-center justify-between">
                    {subscription.payment_status === "paid" ? (
                        <Button
                            variant="link"
                            size="sm"
                            className="h-8 gap-2 text-muted-foreground px-1 hover:text-foreground"
                            onClick={() => subscriptionsApi.downloadCard(subscription.id, subscription.subscription_number)}
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">Download Member Card</span>
                        </Button>
                    ) : (
                        <div />
                    )}
                    <Button onClick={() => onOpenChange(false)} variant="secondary" className="h-9 px-6 text-sm font-bold">
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
