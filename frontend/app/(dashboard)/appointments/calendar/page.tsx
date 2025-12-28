"use client";

import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar as CalendarIcon, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";

// Dynamically import FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import("@fullcalendar/react").then((mod) => mod.default),
  { ssr: false }
);

// Import plugins
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

export default function AppointmentCalendarPage() {
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());

  // Calculate date range for the current view (month view)
  const startDate = useMemo(() => {
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    return format(firstDay, "yyyy-MM-dd");
  }, [currentDate]);

  const endDate = useMemo(() => {
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return format(lastDay, "yyyy-MM-dd");
  }, [currentDate]);

  const { data: calendarData = [], isLoading } = useQuery({
    queryKey: ["appointments-calendar", startDate, endDate],
    queryFn: () =>
      appointmentsApi.calendar({
        start_date: startDate,
        end_date: endDate,
      }),
  });

  // Transform calendar data to FullCalendar events
  const events = useMemo(() => {
    const eventList: any[] = [];
    calendarData.forEach((day: any) => {
      day.appointments?.forEach((appointment: any) => {
        const appointmentDate = parseISO(appointment.appointment_date);
        const appointmentTime = appointment.appointment_time
          ? appointment.appointment_time.split(":").slice(0, 2).join(":")
          : "09:00";
        const [hours, minutes] = appointmentTime.split(":").map(Number);
        const eventDate = new Date(appointmentDate);
        eventDate.setHours(hours, minutes, 0, 0);

        // Determine event color based on status
        let backgroundColor = "#3b82f6"; // default blue
        let borderColor = "#2563eb";
        let textColor = "#ffffff";

        switch (appointment.status) {
          case "confirmed":
            backgroundColor = "#10b981"; // green
            borderColor = "#059669";
            break;
          case "pending":
            backgroundColor = "#f59e0b"; // amber
            borderColor = "#d97706";
            break;
          case "completed":
            backgroundColor = "#6b7280"; // gray
            borderColor = "#4b5563";
            break;
          case "cancelled":
            backgroundColor = "#ef4444"; // red
            borderColor = "#dc2626";
            break;
          case "no_show":
            backgroundColor = "#991b1b"; // dark red
            borderColor = "#7f1d1d";
            break;
        }

        // Determine color based on priority
        if (appointment.priority === "urgent") {
          backgroundColor = "#dc2626"; // red
          borderColor = "#b91c1c";
        } else if (appointment.priority === "high") {
          backgroundColor = "#f59e0b"; // amber
          borderColor = "#d97706";
        }

        eventList.push({
          id: appointment.id.toString(),
          title: `${appointment.customer_name || "Customer"} - ${appointment.vehicle_display || "Vehicle"}`,
          start: eventDate.toISOString(),
          end: appointment.end_time
            ? new Date(
              new Date(eventDate).setHours(
                parseInt(appointment.end_time.split(":")[0]),
                parseInt(appointment.end_time.split(":")[1])
              )
            ).toISOString()
            : new Date(eventDate.getTime() + (appointment.estimated_duration || 60) * 60000).toISOString(),
          backgroundColor,
          borderColor,
          textColor,
          extendedProps: {
            appointment_number: appointment.appointment_number,
            customer_name: appointment.customer_name,
            vehicle_display: appointment.vehicle_display,
            service_type: appointment.service_type,
            status: appointment.status,
            priority: appointment.priority,
            service_bay_name: appointment.service_bay_name,
          },
        });
      });
    });
    return eventList;
  }, [calendarData]);

  const handleEventClick = (info: any) => {
    router.push(`/appointments/${info.event.id}`);
  };

  const handleDateClick = (info: any) => {
    // Navigate to create appointment with pre-filled date
    const dateStr = format(info.date, "yyyy-MM-dd");
    router.push(`/appointments/new?date=${dateStr}`);
  };

  const handleDatesSet = (arg: any) => {
    setCurrentDate(arg.start);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/appointments" className="hover:text-blue-600 transition-colors">Appointments</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Calendar</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Appointment Calendar</h1>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/appointments">
            <Button variant="outline" size="sm" className="h-9 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              List View
            </Button>
          </Link>
          <Link href="/appointments/new">
            <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-2" />
              New Appointment
            </Button>
          </Link>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="pt-6">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            datesSet={handleDatesSet}
            height="auto"
            editable={false}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            eventDisplay="block"
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
            }}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
              startTime: "08:00",
              endTime: "18:00",
            }}
            eventContent={(eventInfo) => {
              const appointment = eventInfo.event.extendedProps;
              return (
                <div className="fc-event-main-frame">
                  <div className="fc-event-time">{eventInfo.timeText}</div>
                  <div className="fc-event-title-container">
                    <div className="fc-event-title fc-sticky">
                      {appointment.customer_name || "Customer"}
                    </div>
                    {appointment.vehicle_display && (
                      <div className="fc-event-title" style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                        {appointment.vehicle_display}
                      </div>
                    )}
                    {appointment.service_bay_name && (
                      <div className="fc-event-title" style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                        Bay: {appointment.service_bay_name}
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-blue-500"></div>
              <span className="text-sm text-gray-700">Normal</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-sm text-gray-700">Confirmed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-amber-500"></div>
              <span className="text-sm text-gray-700">Pending / High Priority</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-sm text-gray-700">Urgent / Cancelled</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-gray-500"></div>
              <span className="text-sm text-gray-700">Completed</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

