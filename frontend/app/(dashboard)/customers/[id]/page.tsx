"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { customersApi } from "@/lib/api/customers";
import { useRecentItems } from "@/lib/hooks/useRecentItems";
import { billingApi } from "@/lib/api/billing";
import { workordersApi } from "@/lib/api/workorders";
import { appointmentsApi, type Appointment } from "@/lib/api/appointments";
import { subscriptionsApi } from "@/lib/api/subscriptions";
import { PageHeader } from "@/components/shared/PageHeader";
import { CustomerSidebar } from "./components/CustomerSidebar";
import { ProfileView } from "./components/views/ProfileView";
import { ContactsView } from "./components/views/ContactsView";
import { RemindersView } from "./components/views/RemindersView";
import { DataTable } from "@/components/shared/DataTable";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { InvoicesView } from "./components/views/InvoicesView";
import { EstimatesView } from "./components/views/EstimatesView";
import { StatementView } from "./components/views/StatementView";
import { FilesView } from "./components/views/FilesView";
import { PaymentsView } from "./components/views/PaymentsView";
import { CreditNotesView } from "./components/views/CreditNotesView";
import { ContractsView } from "./components/views/ContractsView";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { SubscriptionsView } from "./components/views/SubscriptionsView";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { VehiclesView } from "./components/views/VehiclesView";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { WorkOrdersView } from "./components/views/WorkOrdersView";
import { NotesView } from "./components/views/NotesView";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = parseInt(params.id as string);
  const initialView = searchParams.get("view") || "profile";
  const [activeView, setActiveView] = useState(initialView);
  const { formatCurrency } = useCurrency();
  const { addRecentItem } = useRecentItems();

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", activeView);
    window.history.pushState({}, "", url.toString());
  }, [activeView]);

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => customersApi.get(customerId),
  });

  useEffect(() => {
    if (customer) {
      addRecentItem({
        id: customer.id,
        name: customer.company_name || `${customer.user?.first_name} ${customer.user?.last_name}`,
        type: "customer",
        href: `/customers/${customer.id}`,
      });
    }
  }, [customer, addRecentItem]);

  // Fetch counts for sidebar
  const { data: vehicles = [] } = useQuery({ queryKey: ["customer", customerId, "vehicles"], queryFn: () => customersApi.vehicles(customerId), enabled: !!customerId });
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", "customer", customerId], queryFn: () => billingApi.invoices.list({ customer: customerId }).then(res => res.results), enabled: !!customerId });
  const { data: estimates = [] } = useQuery({ queryKey: ["estimates", "customer", customerId], queryFn: () => billingApi.estimates.list({ customer: customerId }).then(res => res.results), enabled: !!customerId });
  const { data: payments = [] } = useQuery({ queryKey: ["payments", "customer", customerId], queryFn: () => billingApi.payments.list({ customer: customerId }), enabled: !!customerId });
  const { data: subscriptions = [] } = useQuery({ queryKey: ["subscriptions", "customer", customerId], queryFn: () => subscriptionsApi.list({ customer: customerId }).then(res => res.results), enabled: !!customerId });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments", "customer", customerId], queryFn: () => appointmentsApi.list({ customer: customerId, all_branches: true, ordering: "-appointment_date" }).then(res => res.results), enabled: !!customerId });
  const { data: workOrders = [] } = useQuery({ queryKey: ["workorders", "customer", customerId], queryFn: () => workordersApi.list({ customer: customerId }).then(res => res.results), enabled: !!customerId });
  const { data: reminders = [] } = useQuery({ queryKey: ["customer-reminders", customerId], queryFn: () => customersApi.reminders.list(customerId), enabled: !!customerId });
  const { data: contacts = [] } = useQuery({ queryKey: ["customer-contacts", customerId], queryFn: () => customersApi.contacts.list(customerId), enabled: !!customerId });

  const counts = {
    vehicles: vehicles.length,
    invoices: invoices.length,
    estimates: estimates.length,
    payments: payments.length,
    subscriptions: subscriptions.length,
    appointments: appointments.length,
    work_orders: workOrders.length,
    reminders: reminders.length,
    contacts: contacts.length,
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading customer...</div>;
  if (error || !customer) return <div className="p-8 text-center text-destructive">Error loading customer</div>;

  const renderContent = () => {
    switch (activeView) {
      case "profile":
        return <ProfileView customer={customer} />;
      case "contacts":
        return <ContactsView customerId={customerId} />;
      case "reminders":
        return <RemindersView customerId={customerId} />;
      case "invoices":
        return <InvoicesView customerId={customerId} />;
      case "estimates":
        return <EstimatesView customerId={customerId} />;
      case "statement":
        return <StatementView customerId={customerId} />;
      case "files":
        return <FilesView customerId={customerId} />;
      case "vehicles":
        return (
          <DataTable
            data={vehicles}
            columns={[
              { header: "Year", accessorKey: "year" },
              { header: "Make", accessorKey: "make" },
              { header: "Model", accessorKey: "model" },
              { header: "License Plate", accessorKey: "license_plate" },
              { header: "VIN", accessorKey: "vin" },
            ]}
            emptyMessage="No vehicles found"

            onRowDoubleClick={(item: any) => router.push(`/vehicles/${item.id}`)}
          />
        );
      case "appointments":
        return (
          <DataTable<Appointment>
            data={appointments}
            columns={[
              { header: "Appointment #", accessorKey: "appointment_number", cell: (item) => <Link href={`/appointments/${item.id}`} className="text-primary hover:underline">{item.appointment_number}</Link> },
              { header: "Date", accessorKey: "appointment_date", cell: (item) => item.appointment_date ? format(new Date(item.appointment_date), "MMM dd, yyyy") : "-" },
              { header: "Time", accessorKey: "appointment_time" },
              { header: "Vehicle", accessorKey: "vehicle_display", cell: (item) => item.vehicle_display || item.vehicle_info || item.vehicle_plate || "-" },
              { header: "Service", accessorKey: "service_type" },
              { header: "Status", accessorKey: "status", cell: (item) => <Badge variant="outline">{item.status}</Badge> },
              { header: "Branch", accessorKey: "branch_name" },
              { header: "Estimate", accessorKey: "estimated_cost", cell: (item) => item.estimated_cost ? formatCurrency(Number(item.estimated_cost)) : "-" },
            ]}
            emptyMessage="No appointments found"
            onRowDoubleClick={(item) => router.push(`/appointments/${item.id}`)}
          />
        );
      case "workorders":
        return (
          <DataTable
            data={workOrders}
            columns={[

              { header: "WO #", accessorKey: "work_order_number", cell: (item: any) => <Link href={`/workorders/${item.id}`} className="text-primary hover:underline">{item.work_order_number}</Link> },

              { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> },
              { header: "Vehicle", accessorKey: "vehicle_info" },
              { header: "Technician", accessorKey: "primary_technician_name" },

            ] as any}
            emptyMessage="No work orders found"
          />
        );
      case "payments":
        return <PaymentsView customerId={customerId} />;
      case "credit-notes":
        return <CreditNotesView customerId={customerId} />;
      case "notes":
        return <NotesView customerId={customerId} />;
      case "contracts":
        return <ContractsView customerId={customerId} />;
      case "subscriptions":
        return (
          <DataTable
            data={subscriptions}
            columns={[
              { header: "Plan", accessorKey: "plan_name" },

              { header: "Status", accessorKey: "status", cell: (item: any) => <Badge>{item.status}</Badge> },
              { header: "Start Date", accessorKey: "start_date" },
              { header: "End Date", accessorKey: "end_date" },

            ] as any}
            emptyMessage="No subscriptions found"
          />
        );

      default:
        return <div className="p-8 text-center text-muted-foreground">View not implemented yet</div>;
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 bg-background">
      <div className="max-w-[1600px] mx-auto p-4 sm:p-6">
        <PageHeader
          title={customer.company_name || `${customer.user?.first_name} ${customer.user?.last_name}`}
          actions={
            <div className="flex gap-2">
              <Link href="/customers">
                <Button size="sm" variant="outline">
                  Back to List
                </Button>
              </Link>
              <Link href={`/customers/${customerId}/edit`}>
                <Button size="sm">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Customer
                </Button>
              </Link>
              <WhatsAppButton
                templateType="custom"
                objectId={customerId}
                label="WhatsApp"
                size="sm"
              />
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-0 border border-border rounded-lg overflow-hidden bg-card shadow-sm min-h-[600px]">
          <CustomerSidebar
            activeView={activeView}
            onViewChange={setActiveView}
            counts={counts}
          />
          <div className="p-0 overflow-y-auto">
            <div className="p-6">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
