"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, isSameDay } from "date-fns";
import { Calendar, Clock, Car, User } from "lucide-react";
import { appointmentsApi, Appointment } from "@/lib/api/appointments";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { usePullToRefresh } from "@/components/mobile/usePullToRefresh";
import { cn } from "@/lib/utils";

export default function MobileSchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const weekDays = useMemo(() => {
    const start = addDays(selectedDate, -3);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const data = await appointmentsApi.mySchedule(dateStr);
      setAppointments(data.appointments || []);
    } catch {
      setError(true);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  usePullToRefresh(load);

  const sorted = useMemo(
    () =>
      [...appointments].sort((a, b) =>
        (a.appointment_time || "").localeCompare(b.appointment_time || "")
      ),
    [appointments]
  );

  return (
    <MobilePageShell
      title="My Schedule"
      description={format(selectedDate, "EEEE, MMMM d, yyyy")}
      className="space-y-4"
    >
      <div className="flex gap-2 overflow-x-auto pb-1">
        {weekDays.map((day) => {
          const active = isSameDay(day, selectedDate);
          return (
            <Button
              key={day.toISOString()}
              variant={active ? "default" : "outline"}
              size="sm"
              className={cn("shrink-0 flex-col h-auto py-2 px-3 min-w-[52px]")}
              onClick={() => setSelectedDate(day)}
            >
              <span className="text-[10px] uppercase">{format(day, "EEE")}</span>
              <span className="text-sm font-bold">{format(day, "d")}</span>
            </Button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : error ? (
        <MobileErrorState title="Could not load schedule" onRetry={load} />
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No appointments this day</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((apt) => (
            <Card key={apt.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-primary" />
                    {apt.appointment_time?.slice(0, 5) || "—"}
                  </div>
                  <Badge variant="outline" className="capitalize text-xs">
                    {apt.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span>{apt.customer_name || "Customer"}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Car className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{apt.vehicle_display || apt.vehicle_info || "Vehicle"}</span>
                </div>
                {apt.customer_concerns && (
                  <p className="text-xs text-muted-foreground border-t border-border pt-2">
                    {apt.customer_concerns}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </MobilePageShell>
  );
}
