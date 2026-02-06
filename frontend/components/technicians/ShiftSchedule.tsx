"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from "date-fns";
import { Shift, shiftsApi } from "@/lib/api/technicians";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, PlayCircle, StopCircle, Coffee, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/lib/hooks/useToast";

interface ShiftScheduleProps {
    shifts: Shift[];
    technicianId: number;
}

export function ShiftSchedule({ shifts, technicianId }: ShiftScheduleProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [currentDate, setCurrentDate] = useState(new Date());

    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    const endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start: startDate, end: endDate });

    const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
    const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
    const resetToToday = () => setCurrentDate(new Date());

    // Mutations for time tracking
    const clockInMutation = useMutation({
        mutationFn: (shiftId: number) => shiftsApi.clockIn(shiftId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["technician", technicianId, "shifts"] });
            toast({ title: "Clocked in successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to clock in",
                variant: "destructive",
            });
        },
    });

    const clockOutMutation = useMutation({
        mutationFn: (shiftId: number) => shiftsApi.clockOut(shiftId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["technician", technicianId, "shifts"] });
            toast({ title: "Clocked out successfully" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to clock out",
                variant: "destructive",
            });
        },
    });

    const getShiftsForDay = (date: Date) => {
        return shifts.filter(shift => isSameDay(parseISO(shift.start_time), date));
    };

    const getStatusColor = (status: Shift['status']) => {
        switch (status) {
            case 'scheduled': return "text-primary bg-primary/10 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
            case 'active': return "text-green-600 bg-green-50 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
            case 'completed': return "text-muted-foreground bg-muted border-border bg-muted text-muted-foreground border-border";
            case 'absent': return "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
            case 'cancelled': return "text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
            default: return "text-muted-foreground bg-muted border-border";
        }
    };

    const formatHours = (hours: number | null | undefined) => {
        if (hours === null || hours === undefined) return null;
        const numHours = typeof hours === 'number' ? hours : parseFloat(hours as any);
        if (isNaN(numHours)) return null;
        return `${numHours.toFixed(2)}h`;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                        {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={prevWeek}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={resetToToday}>
                        Today
                    </Button>
                    <Button variant="outline" size="icon" onClick={nextWeek}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                {weekDays.map((day) => {
                    const dayShifts = getShiftsForDay(day);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <Card key={day.toISOString()} className={cn("overflow-hidden flex flex-col h-full min-h-[200px]", isToday && "border-primary ring-1 ring-primary")}>
                            <div className={cn("p-2 text-center text-sm font-medium border-b bg-muted/50", isToday && "bg-primary/10 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300")}>
                                {format(day, "EEE, MMM d")}
                            </div>
                            <CardContent className="p-2 flex-1 space-y-2">
                                {dayShifts.length > 0 ? (
                                    dayShifts.map(shift => (
                                        <div
                                            key={shift.id}
                                            className={cn("text-xs p-2 rounded-md border space-y-1.5", getStatusColor(shift.status))}
                                        >
                                            {/* Scheduled Time */}
                                            <div className="flex items-center gap-1 font-semibold">
                                                <Clock className="h-3 w-3" />
                                                <span>
                                                    {format(parseISO(shift.start_time), "HH:mm")} - {format(parseISO(shift.end_time), "HH:mm")}
                                                </span>
                                            </div>

                                            {/* Status Badge */}
                                            <div className="flex items-center justify-between">
                                                <span className="capitalize font-medium">{shift.status}</span>
                                                {shift.scheduled_hours && (
                                                    <span className="text-[10px] opacity-70">
                                                        {formatHours(shift.scheduled_hours)} scheduled
                                                    </span>
                                                )}
                                            </div>

                                            {/* Actual Hours (if completed or active) */}
                                            {shift.actual_hours !== null && shift.actual_hours !== undefined && (
                                                <div className="bg-card/50 dark:bg-black/20 p-1.5 rounded text-[10px] space-y-0.5">
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Actual:</span>
                                                        <span className="font-semibold">{formatHours(shift.actual_hours)}</span>
                                                    </div>
                                                    {shift.overtime_hours !== null && shift.overtime_hours !== undefined && shift.overtime_hours > 0 && (
                                                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                                                            <span className="opacity-70">Overtime:</span>
                                                            <span className="font-semibold">{formatHours(shift.overtime_hours)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Clock In/Out Buttons */}
                                            {shift.status === 'scheduled' && !shift.actual_start_time && (
                                                <Button
                                                    size="sm"
                                                    className="w-full h-7 text-[10px]"
                                                    onClick={() => clockInMutation.mutate(shift.id)}
                                                    disabled={clockInMutation.isPending}
                                                >
                                                    <PlayCircle className="h-3 w-3 mr-1" />
                                                    Clock In
                                                </Button>
                                            )}

                                            {shift.status === 'active' && shift.actual_start_time && !shift.actual_end_time && (
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    className="w-full h-7 text-[10px]"
                                                    onClick={() => clockOutMutation.mutate(shift.id)}
                                                    disabled={clockOutMutation.isPending}
                                                >
                                                    <StopCircle className="h-3 w-3 mr-1" />
                                                    Clock Out
                                                </Button>
                                            )}

                                            {/* Notes */}
                                            {shift.notes && (
                                                <div className="text-[10px] opacity-80 truncate border-t pt-1" title={shift.notes}>
                                                    {shift.notes}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic opacity-50">
                                        No shifts
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {shifts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No shifts found for this technician.</p>
                </div>
            )}
        </div>
    );
}
