import { BookMarked } from "lucide-react";
import type { HelpGuide } from "./types";

export const glossaryGuides: HelpGuide[] = [
    {
        id: "glossary",
        title: "Glossary & Terms",
        description: "Common terms used in Smart Vehicle Repair System.",
        icon: BookMarked,
        section: "glossary",
        keywords: ["glossary", "terms", "definitions"],
        topics: [
            {
                title: "Core terms",
                blocks: [
                    {
                        type: "paragraph",
                        text: "**Work Order (Job Card)** — The central record for a repair visit. Tracks status, technician, parts, time, inspection, diagnosis, and billing.",
                    },
                    {
                        type: "paragraph",
                        text: "**Estimate** — A quoted price sent to the customer before repair work begins. Requires approval to proceed.",
                    },
                    {
                        type: "paragraph",
                        text: "**Proforma Invoice** — A formal quotation document that looks like an invoice but is not a tax invoice until work is done.",
                    },
                    {
                        type: "paragraph",
                        text: "**Gate Pass** — Authorization document allowing a vehicle to leave the workshop. Issued after payment clearance.",
                    },
                    {
                        type: "paragraph",
                        text: "**Check-In** — Front-desk wizard that creates customer, vehicle, and work order in one flow.",
                    },
                    {
                        type: "paragraph",
                        text: "**Kanban** — Visual board showing work orders by status column. Drag cards to advance valid statuses.",
                    },
                    {
                        type: "paragraph",
                        text: "**Till** — Cash drawer session. Open at shift start, close with counted cash at shift end.",
                    },
                    {
                        type: "paragraph",
                        text: "**Branch** — A workshop location. Users see data for their assigned branch unless they are admin or multi-branch manager.",
                    },
                    {
                        type: "paragraph",
                        text: "**RBAC** — Role-Based Access Control. Permissions assigned by role (Receptionist, Technician, etc.).",
                    },
                    {
                        type: "paragraph",
                        text: "**DVI** — Digital Vehicle Inspection. Checklist-based inspection with photos and pass/fail/advisory results.",
                    },
                    {
                        type: "paragraph",
                        text: "**PO** — Purchase Order. Order placed with a supplier for parts replenishment.",
                    },
                    {
                        type: "paragraph",
                        text: "**QC (Quality Check)** — Final verification before a job is marked completed.",
                    },
                    {
                        type: "paragraph",
                        text: "**Paystack** — Online payment gateway used for customer portal and invoice payments (Ghana).",
                    },
                    {
                        type: "paragraph",
                        text: "**PWA** — Progressive Web App. Mobile technician interface installable on phone home screen.",
                    },
                ],
            },
            {
                title: "Work order status definitions",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "**Draft** — Created but not yet in active workflow",
                            "**Inspection** — Intake inspection in progress",
                            "**Intake** — Customer concerns captured, awaiting assignment",
                            "**Assigned** — Technician assigned, not yet diagnosing",
                            "**Diagnosis** — Fault-finding in progress",
                            "**Awaiting Approval** — Estimate sent, waiting for customer",
                            "**Approved** — Customer approved — repair authorized",
                            "**In Progress** — Active repair work",
                            "**Paused** — Waiting for parts or customer decision",
                            "**Additional Work Found** — New faults discovered during repair",
                            "**Quality Check** — Final inspection before completion",
                            "**Completed** — Repair done, ready for invoicing",
                            "**Invoiced** — Invoice generated",
                            "**Closed** — Fully paid and archived",
                        ],
                    },
                ],
                actionLink: "/workorders",
                actionLabel: "Work Orders",
            },
        ],
    },
];
