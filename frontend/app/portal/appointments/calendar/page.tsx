"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

// Dynamically import FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import("@fullcalendar/react").then((mod) => mod.default),
  { ssr: false }
);

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

export default function AppointmentCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("dayGridMonth");

  // Calculate date range based on current view
  const { startDate, endDate } = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "dayGridMonth") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    } else if (view === "timeGridWeek") {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
      end.setDate(start.getDate() + 6);
    }
    // For day view, start and end are the same day

    return {
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
    };
  }, [currentDate, view]);

  const { data: calendarData = [], isLoading } = useQuery({
    queryKey: ["portal", "appointments-calendar", startDate, endDate],
    queryFn: () =>
      appointmentsApi.calendar({
        start_date: startDate,
        end_date: endDate,
      }),
  });

  // Transform calendar data to FullCalendar events
  const events = useMemo(() => {
    const eventList: any[] = [];

    if (Array.isArray(calendarData)) {
      calendarData.forEach((day: any) => {
        if (day.appointments && Array.isArray(day.appointments)) {
          day.appointments.forEach((apt: any) => {
            const appointmentDate = new Date(apt.appointment_date);
            const timeParts = apt.appointment_time ? apt.appointment_time.split(":") : ["09", "00"];
            const [hours, minutes] = timeParts.map(Number);
            appointmentDate.setHours(hours, minutes, 0, 0);

            const statusColors: Record<string, string> = {
              pending: "#f59e0b",
              confirmed: "#3b82f6",
              in_progress: "#8b5cf6",
              completed: "#10b981",
              cancelled: "#ef4444",
              rescheduled: "#f97316",
            };

            eventList.push({
              id: String(apt.id),
              title: `${apt.vehicle_info || apt.vehicle_display || "Vehicle"} - ${apt.service_type || "Service"}`,
              start: appointmentDate.toISOString(),
              end: new Date(
                appointmentDate.getTime() + (apt.estimated_duration || 60) * 60000
              ).toISOString(),
              backgroundColor: statusColors[apt.status] || "#6b7280",
              borderColor: statusColors[apt.status] || "#6b7280",
              extendedProps: {
                appointment: apt,
              },
              url: `/portal/appointments/${apt.id}`,
            });
          });
        }
      });
    }

    return eventList;
  }, [calendarData]);

  const handleDateClick = (arg: any) => {
    // Navigate to book appointment page with pre-filled date
    const clickedDate = format(arg.date, "yyyy-MM-dd");
    window.location.href = `/portal/book?date=${clickedDate}`;
  };

  const handleEventClick = (arg: any) => {
    // Navigate to appointment detail
    if (arg.event.url) {
      arg.jsEvent.preventDefault();
      window.location.href = arg.event.url;
    }
  };

  const handleDatesSet = (arg: any) => {
    setCurrentDate(arg.start);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/portal/appointments">
            <Buttonvariant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Appointment Calendar
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              View your appointments in calendar format
            </p>
          </div>
        </div>
        <Link href="/portal/book">
          <Button>
            <CalendarIcon className="w-4 h-4 mr-2" />
            Book Appointment
          </Button>
        </Link>
      </div>

      {/* View Toggle */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <Button
              variant={view === "dayGridMonth" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("dayGridMonth")}
            >
              Month
            </Button>
            <Button
              variant={view === "timeGridWeek" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("timeGridWeek")}
            >
              Week
            </Button>
            <Button
              variant={view === "timeGridDay" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("timeGridDay")}
            >
              Day
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardContent className="p-6">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={view}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="auto"
            editable={false}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            weekends={true}
            eventDisplay="block"
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }}
            slotMinTime="08:00:00"
            slotMaxTime="18:00:00"
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5], // Monday - Friday
              startTime: "08:00",
              endTime: "18:00",
            }}
            // className="dark:bg-gray-900"
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-6 text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-yellow-500"></div>
              <span className="text-gray-600 dark:text-gray-400">Pending</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-blue-500"></div>
              <span className="text-gray-600 dark:text-gray-400">Confirmed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-purple-500"></div>
              <span className="text-gray-600 dark:text-gray-400">In Progress</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span className="text-gray-600 dark:text-gray-400">Completed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-gray-600 dark:text-gray-400">Cancelled</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

