import { Calculator, ClipboardList, Headphones, UserCog } from "lucide-react";
import type { HelpGuide } from "./types";

export const quickStartGuides: HelpGuide[] = [
    {
        id: "qs-receptionist",
        title: "Receptionist Quick Start",
        description: "Get productive on day one at the front desk.",
        icon: Headphones,
        section: "quick-start",
        keywords: ["quick start", "receptionist", "day one"],
        topics: [
            {
                title: "First hour checklist",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "Log in and confirm you see **Customers**, **Check-In**, and **Appointments** in the sidebar",
                            "Open **Dashboard** and review today's appointments",
                            "Bookmark **Check-In** — this is your main walk-in tool",
                            "Test global search with **Ctrl+K** using a sample customer name",
                            "Confirm your branch is correct in your user profile",
                        ],
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Open Check-In",
            },
            {
                title: "First customer walk-in (15 minutes)",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Search for the customer by phone number in **Check-In**.",
                            "If new: add customer with name, mobile, and email.",
                            "Select or add their vehicle — decode VIN if available.",
                            "Enter their concern and odometer reading.",
                            "Submit — note the work order number for the customer.",
                            "Tell the service coordinator a new walk-in has arrived.",
                        ],
                    },
                ],
            },
            {
                title: "First appointment booking (10 minutes)",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Appointments → New Appointment**.",
                            "Select customer, vehicle, date, and service type.",
                            "Set status to **Confirmed**.",
                            "Verify the slot appears on **Calendar View**.",
                        ],
                    },
                ],
                actionLink: "/appointments/new",
                actionLabel: "New Appointment",
            },
        ],
    },
    {
        id: "qs-technician",
        title: "Technician Quick Start",
        description: "Start working assigned jobs from desktop or mobile.",
        icon: ClipboardList,
        section: "quick-start",
        keywords: ["quick start", "technician"],
        topics: [
            {
                title: "First shift checklist",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "Open **Work Orders** filtered to your name or use **Mobile Dashboard**",
                            "Review customer complaint and intake notes on each assigned job",
                            "Clock in to your first job before starting work",
                            "Complete inspection before recommending repairs",
                            "Upload at least one photo per major finding",
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile Dashboard",
            },
            {
                title: "Complete one job cycle",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Perform intake inspection on mobile or desktop.",
                            "Complete diagnosis and add recommendations.",
                            "Wait for customer approval — do not repair until **Approved**.",
                            "Request parts, complete repairs, run self-QC.",
                            "Move to **Quality Check** for coordinator sign-off.",
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: "qs-accountant",
        title: "Accountant Quick Start",
        description: "Daily billing and cash routine.",
        icon: Calculator,
        section: "quick-start",
        keywords: ["quick start", "accountant", "billing"],
        topics: [
            {
                title: "Daily billing routine",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "Open **Accounting → Till Management** and open a till for the cash account",
                            "Review **Invoices** with status **Sent** or **Overdue**",
                            "Invoice completed work orders not yet billed",
                            "Record counter payments and print receipts",
                            "Close till at end of shift with cash count",
                            "Run aging report if Monday or month-end",
                        ],
                    },
                ],
                actionLink: "/accounting/tills",
                actionLabel: "Open Till",
            },
        ],
    },
    {
        id: "qs-manager",
        title: "Manager Quick Start",
        description: "Daily oversight in 20 minutes.",
        icon: UserCog,
        section: "quick-start",
        keywords: ["quick start", "manager"],
        topics: [
            {
                title: "Morning management routine",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "Review **Dashboard → What needs action**",
                            "Check jobs stuck in **Awaiting Approval** over 48 hours",
                            "Review low stock alerts in **Parts & Stock**",
                            "Scan **Reports → Operational** for technician workload",
                            "Approve pending POs and refunds",
                        ],
                    },
                ],
                actionLink: "/dashboard",
                actionLabel: "Dashboard",
            },
        ],
    },
];
