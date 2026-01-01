"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ChevronRight, Calendar, Clock, Wrench } from "lucide-react";

interface Appointment {
    id: number;
    customer_name?: string;
    vehicle_display?: string;
    vehicle_info?: string;
    appointment_time?: string;
    status: string;
}

interface WorkOrder {
    id: number;
    work_order_number: string;
    customer_name?: string;
    vehicle_info?: string;
    status: string;
}

interface CompactActivityListProps {
    appointments?: Appointment[];
    workOrders?: WorkOrder[];
}

export function CompactActivityList({ appointments, workOrders }: CompactActivityListProps) {
    return (
        <div className="space-y-4">
            {/* Today's Appointments */}
            <Card className="border-t shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
                <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-500" />
                            <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                                Today's Agenda
                            </CardTitle>
                        </div>
                        <Link
                            href="/appointments"
                            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                            Full Schedule
                            <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {appointments && appointments.length > 0 ? (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {appointments.slice(0, 4).map((apt) => (
                                <Link
                                    key={apt.id}
                                    href={`/appointments/${apt.id}`}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {apt.customer_name || "Guest Customer"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium uppercase tracking-tight">
                                                <Clock className="w-3 h-3" />
                                                {apt.appointment_time || "TBD"}
                                            </div>
                                            <span className="text-gray-200 dark:text-gray-800 text-[10px]">•</span>
                                            <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                                                {apt.vehicle_display || apt.vehicle_info || "No Vehicle"}
                                            </span>
                                        </div>
                                    </div>
                                    <Badge
                                        variant={
                                            apt.status === "confirmed"
                                                ? "success"
                                                : apt.status === "pending"
                                                    ? "warning"
                                                    : "secondary"
                                        }
                                        className="ml-2 text-[9px] px-1.5 py-0 h-4 font-bold uppercase"
                                    >
                                        {apt.status}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-8 text-center flex flex-col items-center justify-center gap-2">
                            <div className="p-2 rounded-full bg-gray-50 dark:bg-gray-800">
                                <Calendar className="w-5 h-5 text-gray-200 dark:text-gray-700" />
                            </div>
                            <p className="text-xs font-medium text-gray-400">
                                No appointments for today
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Work Orders */}
            <Card className="border-t shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
                <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-purple-500" />
                            <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                                Active Orders
                            </CardTitle>
                        </div>
                        <Link
                            href="/workorders"
                            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                            All Orders
                            <ChevronRight className="w-3 h-3" />
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {workOrders && workOrders.length > 0 ? (
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {workOrders.slice(0, 4).map((wo) => (
                                <Link
                                    key={wo.id}
                                    href={`/workorders/${wo.id}`}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[10px] font-bold text-gray-400 group-hover:text-blue-500 transition-colors">
                                                #{wo.work_order_number}
                                            </span>
                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {wo.customer_name || "N/A"}
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-0.5 truncate uppercase tracking-tight font-medium">
                                            {wo.vehicle_info || "No Vehicle Info"}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={
                                            wo.status === "in_progress"
                                                ? "default"
                                                : wo.status === "pending"
                                                    ? "warning"
                                                    : "secondary"
                                        }
                                        className="ml-2 text-[9px] px-1.5 py-0 h-4 font-bold uppercase"
                                    >
                                        {wo.status.replace(/_/g, " ")}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="px-4 py-8 text-center flex flex-col items-center justify-center gap-2">
                            <div className="p-2 rounded-full bg-gray-50 dark:bg-gray-800">
                                <Wrench className="w-5 h-5 text-gray-200 dark:text-gray-700" />
                            </div>
                            <p className="text-xs font-medium text-gray-400">
                                No recent work orders
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
