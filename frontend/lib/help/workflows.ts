import { Car, ClipboardList, CreditCard, Package, Ticket } from "lucide-react";
import type { HelpGuide } from "./types";

export const workflowGuides: HelpGuide[] = [
    {
        id: "wf-repair-lifecycle",
        title: "Complete Repair Lifecycle",
        description: "End-to-end flow from customer arrival to vehicle release and payment.",
        icon: ClipboardList,
        section: "workflows",
        keywords: ["repair", "lifecycle", "work order", "workflow"],
        topics: [
            {
                title: "Overview",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Every repair follows the same validated path. Skipping steps causes billing errors, compliance gaps, and customer disputes. Each role owns specific handoffs.",
                    },
                ],
            },
            {
                title: "Phase 1 — Arrival and intake",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "**Receptionist:** Customer arrives (appointment or walk-in). Search customer, verify vehicle, run **Check-In**.",
                            "**System:** Work order created in **Draft** or moves to **Inspection**.",
                            "**Technician:** Performs intake inspection — documents condition, mileage, visible damage.",
                            "**Coordinator:** Reviews inspection, moves to **Intake** then **Assigned**.",
                        ],
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Check-In",
            },
            {
                title: "Phase 2 — Diagnosis and approval",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "**Technician:** Diagnoses fault, adds recommendations with parts and labor.",
                            "**Coordinator:** Reviews diagnosis, creates **Estimate**, sends to customer.",
                            "**Customer:** Approves via portal or in person.",
                            "**SystemSetting:** **Awaiting Approval** → **Approved**.",
                        ],
                    },
                ],
                actionLink: "/billing/estimates",
                actionLabel: "Estimates",
            },
            {
                title: "Phase 3 — Repair and quality",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "**Parts desk:** Fulfills parts request, allocates stock to work order.",
                            "**Technician:** Repairs in **In Progress**, clocks time, uploads photos.",
                            "If extra faults found: **Additional Work Found** → new estimate → re-approval.",
                            "**Technician:** Sends to **Quality Check** when done.",
                            "**Coordinator/Lead tech:** QC pass → **Completed**.",
                        ],
                    },
                ],
            },
            {
                title: "Phase 4 — Billing and release",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "**Accountant:** Converts to **Invoice**, records payment.",
                            "**Status:** **Completed** → **Invoiced**.",
                            "**Receptionist:** Issues **Gate Pass** after payment confirmed.",
                            "**Customer:** Collects vehicle. Pass marked **Completed**.",
                            "**Accountant:** Closes work order → **Closed**.",
                        ],
                    },
                ],
                actionLink: "/gatepass",
                actionLabel: "Gate Passes",
            },
        ],
    },
    {
        id: "wf-walk-in",
        title: "Walk-In Customer Workflow",
        description: "Fast path for customers arriving without an appointment.",
        icon: Car,
        section: "workflows",
        keywords: ["walk-in", "check-in"],
        topics: [
            {
                title: "Walk-in procedure",
                blocks: [
                    {
                        type: "checklist",
                        items: [
                            "Greet customer and ask if they have visited before",
                            "Search by phone in Check-In — never assume new customer",
                            "Capture concern, odometer, and priority",
                            "Provide work order reference and estimated wait time",
                            "Notify service coordinator",
                            "Offer portal registration for status tracking",
                        ],
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Check-In",
            },
        ],
    },
    {
        id: "wf-parts-to-job",
        title: "Parts Request to Job Completion",
        description: "How parts move from stock to a billed work order.",
        icon: Package,
        section: "workflows",
        keywords: ["parts", "allocation", "inventory"],
        topics: [
            {
                title: "Parts workflow",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Technician submits **Parts Request** linked to work order.",
                            "Parts manager checks stock — allocates or creates PO if out of stock.",
                            "If PO required: job moves to **Paused** until parts arrive.",
                            "Parts issued to job — appear on invoice line items.",
                            "Unused parts returned to stock with work order reference.",
                        ],
                    },
                ],
                actionLink: "/inventory/parts-requests",
                actionLabel: "Parts Requests",
            },
        ],
    },
    {
        id: "wf-payment-release",
        title: "Payment to Vehicle Release",
        description: "Financial clearance before the customer drives away.",
        icon: CreditCard,
        section: "workflows",
        keywords: ["payment", "gate pass", "release"],
        topics: [
            {
                title: "Release procedure",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Work order reaches **Completed** — accountant creates invoice.",
                            "Customer pays (counter, transfer, or portal Paystack).",
                            "Invoice status: **Paid** or approved **Partial** on account.",
                            "Receptionist creates gate pass linked to work order.",
                            "Security/reception marks pass **Completed** when vehicle exits.",
                        ],
                    },
                    {
                        type: "note",
                        text: "Never release a vehicle with an unpaid invoice unless the manager has approved credit terms for that customer account.",
                    },
                ],
                actionLink: "/billing/invoices",
                actionLabel: "Invoices",
            },
        ],
    },
    {
        id: "wf-gate-pass",
        title: "Gate Pass Workflow",
        description: "Controlled vehicle exit authorization.",
        icon: Ticket,
        section: "workflows",
        keywords: ["gate pass"],
        topics: [
            {
                title: "Gate pass statuses",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Gate pass statuses: **Pending** → **Issued** → **Completed** (or **Cancelled** if release is blocked).",
                    },
                    {
                        type: "steps",
                        items: [
                            "Verify invoice payment with billing.",
                            "Create gate pass from work order.",
                            "Verify collector identity.",
                            "Issue pass — give customer a copy if your branch prints passes.",
                            "Mark completed when vehicle leaves the property.",
                        ],
                    },
                ],
                actionLink: "/gatepass",
                actionLabel: "Gate Passes",
            },
        ],
    },
];
