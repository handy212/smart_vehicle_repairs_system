import { ShieldCheck, Sparkles } from "lucide-react";
import type { HelpGuide } from "./types";

export const bestPracticeGuides: HelpGuide[] = [
    {
        id: "bp-all",
        title: "Best Practices",
        description: "Operational standards that reduce errors and improve customer satisfaction.",
        icon: Sparkles,
        section: "best-practices",
        keywords: ["best practices", "standards", "quality"],
        topics: [
            {
                title: "Customer intake best practices",
                blocks: [
                    {
                        type: "tips",
                        title: "Do this every time",
                        items: [
                            "Search by phone number before creating any new customer",
                            "Read back the mobile number to the customer for confirmation",
                            "Record the customer's exact words for concerns — do not paraphrase to jargon",
                            "Photograph existing damage at intake when disputes are likely",
                            "Confirm who authorized the repair on fleet or company vehicles",
                            "Offer portal registration so customers track progress without calling",
                        ],
                    },
                    {
                        type: "mistakes",
                        title: "Avoid these",
                        items: [
                            "Creating duplicate customers for spouses on the same account",
                            "Using placeholder emails like 'none@email.com'",
                            "Starting a work order without odometer reading",
                        ],
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Check-In",
            },
            {
                title: "Work order management best practices",
                blocks: [
                    {
                        type: "tips",
                        items: [
                            "One work order per visit unless customer has unrelated issues requiring separate billing",
                            "Use **Paused** with a note instead of leaving jobs silently in **In Progress**",
                            "Never skip **Quality Check** — it protects your brand and reduces comebacks",
                            "Link every parts issue to the work order for accurate job costing",
                            "Review Kanban-style Kanban board each morning for bottlenecks",
                            "Close or invoice jobs within 24 hours of completion",
                        ],
                    },
                ],
                actionLink: "/workorders/kanban",
                actionLabel: "Kanban Board",
            },
            {
                title: "Security best practices",
                blocks: [
                    {
                        type: "tips",
                        items: [
                            "Enable 2FA for all admin, manager, and accountant accounts",
                            "Never share login credentials — each staff member needs their own account",
                            "Log out on shared reception computers when stepping away",
                            "Review audit log monthly for unusual after-hours changes",
                            "Do not export customer data to personal devices or email",
                            "Rotate API keys (Paystack, Hubtel) when staff with access leave",
                        ],
                    },
                ],
                actionLink: "/admin/audit-log",
                actionLabel: "Audit Log",
            },
            {
                title: "Mobile technician best practices",
                blocks: [
                    {
                        type: "tips",
                        items: [
                            "Upload photos at the bay while details are fresh",
                            "Clock time accurately — one active timer at a time",
                            "Use mobile for inspections; use desktop for complex diagnosis entry",
                            "Sync before leaving areas with poor connectivity",
                            "Install the PWA home screen shortcut for faster access",
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile App",
            },
            {
                title: "Data entry best practices",
                blocks: [
                    {
                        type: "tips",
                        items: [
                            "Use VIN decode instead of manual make/model entry",
                            "Standardize phone numbers with country code (+233 for Ghana)",
                            "Select parts from catalog — avoid free-text part lines when possible",
                            "Add internal notes for anything unusual — future staff will read them",
                            "Keep customer billing address current for corporate accounts",
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: "bp-data-quality",
        title: "Data Quality Standards",
        description: "Keep records clean for reporting, marketing, and compliance.",
        icon: ShieldCheck,
        section: "best-practices",
        keywords: ["data quality", "standards"],
        topics: [
            {
                title: "Record hygiene",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "No duplicate customers — merge or use existing records",
                            "Every vehicle has a valid VIN or documented reason why not",
                            "Work orders always linked to customer AND vehicle",
                            "Inactive customers marked inactive, not deleted",
                            "Part costs updated when supplier prices change",
                        ],
                    },
                ],
            },
        ],
    },
];
