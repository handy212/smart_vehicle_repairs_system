
"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Subscription, subscriptionsApi } from "@/lib/api/subscriptions";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useQuery } from "@tanstack/react-query";
import { Download, User, Car, Calendar, CreditCard, Activity, CheckCircle2, AlertTriangle, XCircle, Clock, FileText, ChevronRight, Fuel, Key, Wrench, Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
            case "active": return <CheckCircle2 className="w-5 h-5" />;
            case "expired": return <AlertTriangle className="w-5 h-5" />;
            case "cancelled": return <XCircle className="w-5 h-5" />;
            case "pending": return <Clock className="w-5 h-5" />;
            default: return null;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "active": return "bg-green-100 text-green-700 border-green-200";
            case "expired": return "bg-red-100 text-red-700 border-red-200";
            case "cancelled": return "bg-slate-100 text-slate-700 border-slate-200";
            case "pending": return "bg-amber-100 text-amber-700 border-amber-200";
            default: return "bg-gray-100 text-gray-700 border-gray-200";
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
        roadside_first_aid: <Wrench className="w-4 h-4" />,
        towing_services_km: <Car className="w-4 h-4" />,
        emergency_fuel: <Fuel className="w-4 h-4" />,
        key_lock_out: <Key className="w-4 h-4" />,
        battery_boosts: <Zap className="w-4 h-4" />,
        default: <Shield className="w-4 h-4" />
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl overflow-hidden bg-slate-50 border-0 shadow-2xl">

                {/* Extended Hero Header */}
                <div className="bg-white border-b relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-orange-50 to-transparent opacity-50 pointer-events-none" />

                    <div className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className={cn("p-2 rounded-lg border", getStatusColor(subscription.status))}>
                                    {getStatusIcon(subscription.status)}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                                        {subscription.package_name}
                                    </h2>
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                                            {subscription.subscription_number}
                                        </span>
                                        <span>•</span>
                                        <span>Since {format(new Date(subscription.start_date), "MMM yyyy")}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right hidden md:block">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</div>
                                <div className={cn("font-bold capitalize", subscription.status === 'active' ? "text-green-600" : "text-slate-600")}>
                                    {subscription.status}
                                </div>
                            </div>
                            <div className="h-8 w-px bg-slate-200 hidden md:block" />
                            <div className="text-right">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Days Left</div>
                                <div className={cn("text-2xl font-black", subscription.days_remaining && subscription.days_remaining < 30 ? "text-red-500" : "text-slate-900")}>
                                    {subscription.days_remaining}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-8">

                    {/* Main Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Card 1: Timeline */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-50 pb-3">
                                <div className="p-1.5 bg-primary/10 text-primary rounded-md">
                                    <Calendar className="w-4 h-4" />
                                </div>
                                Subscription Period
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center group">
                                    <span className="text-sm text-slate-500">Start Date</span>
                                    <span className="text-sm font-semibold text-slate-700">{format(new Date(subscription.start_date), "MMM dd, yyyy")}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Expiration</span>
                                    <span className="text-sm font-semibold text-slate-700">{format(new Date(subscription.end_date), "MMM dd, yyyy")}</span>
                                </div>
                                <div className="pt-3 flex justify-between items-center">
                                    <span className="text-sm text-slate-500">Auto-Renew</span>
                                    <Badge variant={subscription.auto_renew ? "outline" : "secondary"} className={subscription.auto_renew ? "bg-green-50 text-green-700 border-green-200" : ""}>
                                        {subscription.auto_renew ? "Enabled" : "Disabled"}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Customer */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-50 pb-3">
                                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md">
                                    <User className="w-4 h-4" />
                                </div>
                                Customer & Vehicle
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">
                                        {subscription.customer_name?.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="font-bold text-slate-900 text-sm">{subscription.customer_full_name}</div>
                                        <div className="text-xs text-slate-500">CUST-{subscription.customer}</div>
                                    </div>
                                </div>
                                {subscription.vehicle && (
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-3">
                                        <Car className="w-8 h-8 text-slate-300" />
                                        <div>
                                            <div className="text-xs font-bold text-slate-500 uppercase">Vehicle ID</div>
                                            <div className="text-sm font-mono font-medium text-slate-700">{subscription.vehicle}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Card 3: Financials */}
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-50 pb-3">
                                <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
                                    <CreditCard className="w-4 h-4" />
                                </div>
                                Payment Details
                            </div>
                            <div className="space-y-1 text-center py-2">
                                <div className="text-3xl font-black text-slate-900 tracking-tight">
                                    {formatCurrency(parseFloat(subscription.purchase_price))}
                                </div>
                                <Badge variant={subscription.payment_status === "paid" ? "outline" : "secondary"} className={cn("mt-2", subscription.payment_status === "paid" ? "bg-green-50 text-green-700 border-green-200" : "")}>
                                    {subscription.payment_status === 'paid' ? 'Paid in Full' : subscription.payment_status}
                                </Badge>
                            </div>
                            {subscription.activation_date && (
                                <div className="text-center text-xs text-slate-400 pt-2 border-t border-dashed">
                                    Activated {format(new Date(subscription.activation_date), "MMM dd, yyyy")}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Allowances */}
                    {subscription.remaining_allowances && Object.keys(subscription.remaining_allowances).length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                                <Activity className="w-4 h-4" />
                                Balance & Allowances
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {Object.entries(subscription.remaining_allowances).map(([key, value]) => (
                                    <div key={key} className="bg-white border rounded-xl p-4 hover:border-orange-300 hover:shadow-md transition-all group">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="p-1.5 rounded-md bg-slate-50 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                {iconMap[key] || iconMap.default}
                                            </div>
                                        </div>
                                        <div className="text-2xl font-black text-slate-800 group-hover:text-orange-700 transition-colors">{value}</div>
                                        <div className="text-[10px] uppercase font-bold text-slate-400 mt-1 truncate" title={labelMap[key] || key}>
                                            {labelMap[key] || key.replace(/_/g, " ")}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Usage History */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                                <FileText className="w-4 h-4" />
                                Usage History
                            </div>
                            {usageHistory && usageHistory.length > 0 && (
                                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{usageHistory.length} records</span>
                            )}
                        </div>

                        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                            {isLoadingUsage ? (
                                <div className="p-12 text-center text-slate-400 text-sm">Loading usage history...</div>
                            ) : usageHistory && usageHistory.length > 0 ? (
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow>
                                            <TableHead className="w-[180px] font-semibold text-slate-600">Date</TableHead>
                                            <TableHead className="font-semibold text-slate-600">Service Type</TableHead>
                                            <TableHead className="font-semibold text-slate-600">Details</TableHead>
                                            <TableHead className="text-right font-semibold text-slate-600">Usage</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {usageHistory.map((usage: any) => (
                                            <TableRow key={usage.id} className="hover:bg-slate-50/50">
                                                <TableCell className="font-medium text-slate-700 text-xs">
                                                    {format(new Date(usage.service_date), "MMM dd, yyyy")}
                                                    <div className="text-[10px] text-slate-400">{format(new Date(usage.service_date), "h:mm a")}</div>
                                                </TableCell>
                                                <TableCell className="capitalize text-xs font-medium text-slate-800">
                                                    <div className="flex items-center gap-2">
                                                        {usage.usage_type?.replace(/_/g, " ")}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-xs text-slate-500">
                                                    {usage.reference_type} <span className="font-mono text-slate-400">#{usage.reference_id || 'N/A'}</span>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-xs text-slate-900">-{usage.quantity_used}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="p-12 flex flex-col items-center justify-center text-center text-slate-400 space-y-2">
                                    <FileText className="w-8 h-8 stroke-1 text-slate-200" />
                                    <p className="text-sm">No services used yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-white border-t flex items-center justify-between">
                    <Button
                        variant="outline"
                        className="gap-2 text-slate-600 hover:text-slate-900 border-slate-200"
                        onClick={() => subscriptionsApi.downloadCard(subscription.id, subscription.subscription_number)}
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Members Card</span>
                    </Button>
                    <Button onClick={() => onOpenChange(false)} className="min-w-[100px]">
                        Close
                    </Button>
                </div>

            </DialogContent>
        </Dialog>
    );
}
