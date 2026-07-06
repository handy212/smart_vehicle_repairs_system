"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from "date-fns";
import { Shift, shiftsApi } from "@/lib/api/technicians";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, PlayCircle, StopCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

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
            queryClient.invalidateQueries({ queryKey: ["technician-shifts", technicianId] });
            toast({ title: "Clocked in successfully" });
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getUserFacingError(error, "Failed to clock in"),
                variant: "destructive",
            });
        },
    });

    const clockOutMutation = useMutation({
        mutationFn: (shiftId: number) => shiftsApi.clockOut(shiftId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["technician-shifts", technicianId] });
            toast({ title: "Clocked out successfully" });
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getUserFacingError(error, "Failed to clock out"),
                variant: "destructive",
            });
        },
    });

    const getShiftsForDay = (date: Date) => {
        return shifts.filter(shift => isSameDay(parseISO(shift.start_time), date));
    };

    const getStatusColor = (status: Shift['status']) => {
        switch (status) {
            case 'scheduled': return "border-primary/20 bg-primary/10 text-primary";
            case 'active': return "border-success/25 bg-success/10 text-success";
            case 'completed': return "border-border bg-muted text-muted-foreground";
            case 'absent': return "border-destructive/20 bg-destructive/10 text-destructive";
            case 'cancelled': return "border-warning/25 bg-warning/10 text-warning-foreground";
            default: return "text-muted-foreground bg-muted border-border";
        }
    };

    const formatHours = (hours: number | null | undefined) => {
        if (hours === null || hours === undefined) return null;

        const numHours = Number(hours);
        if (isNaN(numHours)) return null;
        return `${numHours.toFixed(2)}h`;
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevWeek}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={resetToToday}>
                        Today
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextWeek}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {weekDays.map((day) => {
                    const dayShifts = getShiftsForDay(day);
                    const isToday = isSameDay(day, new Date());

                    return (
                        <Card key={day.toISOString()} className={cn("flex min-h-[160px] flex-col overflow-hidden", isToday && "border-primary ring-1 ring-primary")}>
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
                                            <div className="flex items-center gap-1 font-semibold">
                                                <Clock className="h-3 w-3" />
                                                <span>
                                                    {format(parseISO(shift.start_time), "HH:mm")} - {format(parseISO(shift.end_time), "HH:mm")}
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <span className="capitalize font-medium">{shift.status}</span>
                                                {shift.scheduled_hours && (
                                                    <span className="text-[10px] opacity-70">
                                                        {formatHours(shift.scheduled_hours)} scheduled
                                                    </span>
                                                )}
                                            </div>

                                            {shift.actual_hours !== null && shift.actual_hours !== undefined && (
                                                <div className="bg-card/50 dark:bg-black/20 p-1.5 rounded text-[10px] space-y-0.5">
                                                    <div className="flex justify-between">
                                                        <span className="opacity-70">Actual:</span>
                                                        <span className="font-semibold">{formatHours(shift.actual_hours)}</span>
                                                    </div>
                                                    {shift.overtime_hours !== null && shift.overtime_hours !== undefined && shift.overtime_hours > 0 && (
                                                        <div className="flex justify-between text-warning dark:text-orange-400">
                                                            <span className="opacity-70">Overtime:</span>
                                                            <span className="font-semibold">{formatHours(shift.overtime_hours)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

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
                <div className="rounded-lg border border-dashed bg-muted/20 py-6 text-center text-muted-foreground">
                    <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p className="text-sm">No shifts found for this technician.</p>
                </div>
            )}
        </div>
    );
}
