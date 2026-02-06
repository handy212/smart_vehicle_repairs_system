"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Truck, Eye, Plus } from "lucide-react";
import Link from "next/link";

interface VehicleRoadsideViewProps {
    roadsideRequests: any[];
}

export function VehicleRoadsideView({ roadsideRequests }: VehicleRoadsideViewProps) {
    return (
        <Card className="shadow-sm border">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/30 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700">Roadside Assistance History</CardTitle>
                <Link href="/portal/roadside/new">
                    <Button size="sm" className="h-8">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Request
                    </Button>
                </Link>
            </CardHeader>
            <CardContent className="p-0">
                {roadsideRequests.length > 0 ? (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                    <TableHead className="w-[100px] px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Request #</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Service Type</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Date</TableHead>
                                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Technician</TableHead>
                                    <TableHead className="w-[50px] px-4 h-10 text-right"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {roadsideRequests.map((req: any) => (
                                    <TableRow key={req.id} className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                        <TableCell className="px-4 py-2 font-medium font-mono text-xs text-gray-700">
                                            {req.request_number}
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-900">{req.service_type_display || req.service_type}</span>
                                                {req.is_covered_by_subscription && (
                                                    <Badge variant="success" className="text-[10px] h-5 px-1.5 py-0 font-normal">Covered</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-2">
                                            <Badge variant={req.status === 'completed' ? 'success' : req.status === 'cancelled' ? 'secondary' : 'default'} className="text-[10px] px-2 py-0.5 border shadow-none bg-transparent capitalize">
                                                {req.status_display || req.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-xs text-gray-600">
                                            {format(new Date(req.requested_at), "MMM dd, yyyy HH:mm")}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-sm text-gray-600">
                                            {req.assigned_technician_name || <span className="text-gray-400 italic">Unassigned</span>}
                                        </TableCell>
                                        <TableCell className="px-4 py-2 text-right">
                                            <Link href={`/roadside/${req.id}`}>
                                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Eye className="w-3.5 h-3.5 text-gray-500 hover:text-primary" />
                                                </Button>
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-12 text-muted-foreground">
                        <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="text-base font-medium text-gray-900 dark:text-gray-200">No roadside requests found</p>
                        <p className="text-sm mt-1 mb-4 text-gray-500">This vehicle hasn't requested any roadside assistance yet.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
