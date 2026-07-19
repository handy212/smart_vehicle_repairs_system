import {
    Calculator,
    ClipboardList,
    Headphones,
    Package,
    Settings,
    Smartphone,
    UserCircle,
    UserCog,
    Users,
    Wrench,
} from "lucide-react";
import type { HelpGuide } from "./types";

export const roleGuides: HelpGuide[] = [
    {
        id: "receptionist",
        title: "Receptionist Guide",
        description:
            "Front-desk operations: customer intake, appointments, walk-ins, work orders, gate passes, and basic payments.",
        icon: Headphones,
        section: "roles",
        responsibilities: [
            "Greet customers and capture accurate contact and vehicle information",
            "Search for existing customers before creating duplicates",
            "Book appointments and manage the daily arrival schedule",
            "Check in walk-in customers and start work orders",
            "Issue gate passes when vehicles are ready for pickup",
            "Collect payments at the counter when billing staff are unavailable",
            "Keep customers informed about job status and next steps",
        ],
        keywords: ["front desk", "check-in", "walk-in", "appointment", "gate pass", "intake"],
        topics: [
            {
                title: "Your role at the front desk",
                summary: "You are the first and last person the customer sees. Accuracy here prevents billing and service delays later.",
                blocks: [
                    {
                        type: "paragraph",
                        text: "As a receptionist, you connect customers to the workshop. Every record you create or update becomes the foundation for inspections, diagnosis, billing, and vehicle release. Take time at intake — rushing causes duplicate customers, wrong phone numbers, and vehicles linked to the wrong owner.",
                    },
                    {
                        type: "checklist",
                        title: "Daily responsibilities",
                        items: [
                            "Review today's appointments on the Dashboard or Appointments calendar",
                            "Prepare for walk-ins by keeping Check-In ready on your workstation",
                            "Confirm customer contact details before saving any new profile",
                            "Notify the service coordinator when a vehicle arrives without an appointment",
                            "Issue gate passes only after billing confirms payment or approved credit terms",
                            "Send customers to the portal for estimate approval when they prefer self-service",
                        ],
                    },
                ],
                actionLink: "/dashboard",
                actionLabel: "Open Dashboard",
            },
            {
                title: "Customer intake and search",
                summary: "Always search before you create. Duplicate customers cause split history, missed invoices, and confused follow-ups.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Customers** and search by name, phone, or email before creating anyone new.",
                            "If no match is found, use **Add Customer** or start from **Check-In** for walk-ins.",
                            "Enter the primary phone number and email carefully — these are used for SMS, email, and portal login.",
                            "Select the correct **customer type** (individual, fleet, corporate) because billing terms may differ.",
                            "Set account status to **Active** unless you have a reason to mark the account inactive.",
                            "If the system warns about a possible duplicate (same email or phone), open the existing record instead of creating a new one.",
                        ],
                    },
                    {
                        type: "mistakes",
                        title: "Common mistakes",
                        items: [
                            "Creating a new customer because the name is spelled differently (search by phone instead)",
                            "Saving without a valid mobile number — technicians and SMS reminders cannot reach the customer",
                            "Linking a vehicle to the wrong customer when a family member drops off the car",
                            "Skipping the duplicate warning banner during Check-In",
                        ],
                    },
                    {
                        type: "tips",
                        items: [
                            "Ask: 'Have you visited us before?' before typing a new name.",
                            "Use global search (**Ctrl+K**) to jump to a customer, vehicle, or work order quickly.",
                            "For fleet accounts, confirm who authorizes repairs before starting a work order.",
                        ],
                    },
                ],
                actionLink: "/customers",
                actionLabel: "Open Customers",
                keywords: ["duplicate", "search", "intake", "phone", "email"],
            },
            {
                title: "Vehicle registration",
                summary: "Every job needs the correct vehicle. VIN decoding saves time and reduces data entry errors.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "From Check-In or **Vehicles → Add Vehicle**, select the owning customer first.",
                            "Enter the 17-character **VIN** and click **Decode VIN** to auto-fill make, model, year, and engine details.",
                            "Use the **VIN scanner** on supported devices to capture the barcode from the windshield or door jamb.",
                            "Record current **odometer** reading — it is used for service reminders and warranty discussions.",
                            "Confirm the **license plate** and color so staff can identify the vehicle on the shop floor.",
                            "The system blocks duplicate VINs — if you see an error, search for the existing vehicle instead.",
                        ],
                    },
                    {
                        type: "note",
                        text: "If a customer brings a new vehicle, add it to their profile before creating the work order. Never create a 'floating' vehicle without an owner.",
                    },
                ],
                actionLink: "/vehicles/new",
                actionLabel: "Add Vehicle",
                keywords: ["vin", "decode", "odometer", "plate"],
            },
            {
                title: "Appointment booking",
                summary: "Scheduled arrivals help the workshop plan bays, parts, and technician time.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Appointments → New Appointment** or schedule during Check-In when the walk-in prefers a future date.",
                            "Select the customer, vehicle, service type, branch, and preferred date/time.",
                            "Add the customer's stated concern in the notes — technicians read this before inspection.",
                            "Set status to **Confirmed** once the customer agrees to the slot.",
                            "Use **Calendar View** to avoid double-booking bays or overloading a single time block.",
                            "Send confirmation by SMS or email if your branch uses customer notifications.",
                        ],
                    },
                    {
                        type: "tips",
                        items: [
                            "Book urgent breakdowns as high priority and notify the service coordinator immediately.",
                            "When rescheduling, update the appointment status to **Rescheduled** rather than deleting the record.",
                            "Customers can also book online via the **Customer Portal** — check portal bookings each morning.",
                        ],
                    },
                ],
                actionLink: "/appointments/new",
                actionLabel: "New Appointment",
            },
            {
                title: "Walk-in and Check-In workflow",
                summary: "Check-In is the fastest path from arrival to an active work order.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Check-In** from the sidebar or Quick Actions menu.",
                            "**Step 1 — Customer:** Search and select an existing customer, or add a new one inline.",
                            "**Step 2 — Vehicle:** Select an existing vehicle or register a new one for that customer.",
                            "**Step 3 — Service:** Enter customer concerns, odometer, and priority. Use quick-concern chips for common issues.",
                            "Optionally toggle **Schedule appointment** if the customer is booking ahead instead of leaving the vehicle now.",
                            "**Step 4 — Review:** Confirm all details, then submit to create the work order.",
                            "Print or share the work order reference number with the customer for tracking.",
                        ],
                    },
                    {
                        type: "paragraph",
                        text: "After Check-In, the work order typically starts in **Draft** or moves toward **Inspection** depending on your branch process. Inform the service coordinator that a new walk-in has arrived.",
                    },
                ],
                actionLink: "/check-in",
                actionLabel: "Start Check-In",
                keywords: ["walk-in", "check-in", "wizard"],
            },
            {
                title: "Work order creation (manual)",
                summary: "Use when you need a job card outside the Check-In wizard.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Work Orders → New Work Order**.",
                            "Link the customer, vehicle, and branch.",
                            "Describe the customer complaint clearly — avoid vague entries like 'noise'.",
                            "Set priority (**Low**, **Normal**, **High**, **Urgent**) based on safety and customer need.",
                            "Save the work order. The service coordinator will assign a technician and advance the status.",
                        ],
                    },
                    {
                        type: "mistakes",
                        items: [
                            "Creating a work order without a vehicle linked",
                            "Using 'Draft' jobs as placeholders without customer complaint text",
                            "Skipping inspection for vehicles that require a documented intake inspection",
                        ],
                    },
                ],
                actionLink: "/workorders/new",
                actionLabel: "New Work Order",
            },
            {
                title: "Gate pass handling",
                summary: "A gate pass authorizes vehicle release. Never issue one without confirming payment or approved credit.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Confirm with billing that the invoice is **Paid**, **Partial** with approved terms, or covered by a valid account.",
                            "Open **Gate Passes → New Gate Pass** and link it to the completed work order.",
                            "Verify customer identity and that the person collecting the vehicle is authorized.",
                            "Issue the pass — status moves to **Issued**.",
                            "When the vehicle exits, mark the pass **Completed**.",
                            "If payment is disputed, do not release the vehicle. Escalate to the manager or accountant.",
                        ],
                    },
                    {
                        type: "note",
                        text: "Gate passes are linked to work orders. If you cannot find the pass, search by work order number or customer name.",
                    },
                ],
                actionLink: "/gatepass",
                actionLabel: "Gate Passes",
                keywords: ["release", "vehicle exit", "pickup"],
            },
            {
                title: "Customer communication",
                summary: "Clear communication reduces callbacks and improves customer trust.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Use **Messages** (SMS) for appointment reminders, ready-for-pickup messages, or estimate follow-ups.",
                            "Direct customers to the **Customer Portal** to approve estimates and pay invoices online.",
                            "When a job is awaiting approval, explain that work cannot proceed until the customer approves the estimate.",
                            "Check **Notifications** for system alerts about overdue approvals or failed payments.",
                            "For complaints, log feedback via **Admin → Feedback** if your branch uses QR feedback posters.",
                        ],
                    },
                ],
                actionLink: "/sms",
                actionLabel: "Messages",
            },
            {
                title: "Payment collection basics",
                summary: "Receptionists often collect counter payments. Record them accurately so accounting stays balanced.",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open the invoice from **Billing → Invoices** and confirm the balance due.",
                            "Record payment against the invoice — select method (cash, card, mobile money, bank transfer).",
                            "If using a physical till, ensure a till is **Open** for your shift before accepting cash.",
                            "Print the receipt and give a copy to the customer.",
                            "For online payments, direct the customer to the portal Paystack link — do not mark paid until confirmation.",
                        ],
                    },
                    {
                        type: "mistakes",
                        items: [
                            "Accepting cash without an open till session",
                            "Marking an invoice paid before verifying bank transfer reference",
                            "Applying payment to the wrong invoice when a customer has multiple open jobs",
                        ],
                    },
                ],
                actionLink: "/billing/payments",
                actionLabel: "Payments",
            },
        ],
    },
    {
        id: "technician",
        title: "Technician Guide",
        description:
            "Workshop floor operations: assigned jobs, inspections, diagnosis, time tracking, photos, and parts requests.",
        icon: Wrench,
        section: "roles",
        responsibilities: [
            "Complete assigned inspections and diagnosis thoroughly and on time",
            "Clock time accurately against work orders",
            "Document findings with photos and clear notes",
            "Request parts before starting work that depends on inventory",
            "Update job progress so coordinators and customers see accurate status",
            "Pass quality checks before marking jobs complete",
        ],
        keywords: ["technician", "mobile", "inspection", "diagnosis", "time log", "parts request"],
        topics: [
            {
                title: "Technician dashboard and daily workflow",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Your dashboard shows assigned work orders, active time logs, and urgent tasks. Start each shift by reviewing **My Tasks** and confirming which jobs are priority. Never begin repair work on a job that has not been **Approved** by the customer unless it is a billable diagnostic or inspection-only job.",
                    },
                    {
                        type: "checklist",
                        items: [
                            "Review assigned work orders on Dashboard or Work Orders (filter by your name)",
                            "Clock in to the first job before starting physical work",
                            "Complete inspection checklist before recommending repairs",
                            "Upload photos of worn parts, damage, and completed work",
                            "Request parts early — do not wait until the vehicle is on the lift",
                            "Move status forward only when the actual shop work matches the status",
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile Dashboard",
            },
            {
                title: "Assigned work orders",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Mobile → Work Orders** to see jobs assigned to you.",
                            "Open the job detail page to see customer complaint, service history, and linked inspection.",
                            "Read notes from intake and the service coordinator before touching the vehicle.",
                            "On the work order detail page, tap tasks to start/complete them and use **Labor Time** when working.",
                            "If you find additional faults, flag **Additional Work Found** — do not silently add repairs.",
                            "When repair work is done, **Request Quality Check** (or perform QC if you are the assigned inspector).",
                        ],
                    },
                ],
                actionLink: "/mobile/workorders",
                actionLabel: "Mobile Work Orders",
            },
            {
                title: "Inspections",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Inspections → New Inspection** or perform from the linked work order.",
                            "Select the correct template (e.g., multi-point, pre-purchase, intake).",
                            "Mark each item **Good**, **Attention**, or **Critical** — be honest; advisors sell from your findings.",
                            "Add notes and photos for any **Attention** or **Critical** items.",
                            "Complete the inspection and submit for coordinator review if required.",
                            "Overall result (**Pass**, **Pass with Advisory**, **Fail**) should reflect the worst critical finding.",
                        ],
                    },
                    {
                        type: "tips",
                        items: [
                            "On mobile, open **Inspections** and select **Perform** for a touch-friendly checklist.",
                            "Photos of brake pad thickness, tire wear, and leaks help customers approve estimates faster.",
                        ],
                    },
                ],
                actionLink: "/inspections",
                actionLabel: "Open Inspections",
            },
            {
                title: "Diagnosis",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open the work order and navigate to **Diagnosis** when the job is in diagnosis status.",
                            "Document symptoms, test results, and fault codes clearly.",
                            "Add **Recommendations** with labor and parts estimates for each repair line.",
                            "Mark root cause status when confirmed — this helps warranty and repeat-visit tracking.",
                            "Submit for approval when diagnosis is complete; the coordinator sends the estimate to the customer.",
                        ],
                    },
                ],
                actionLink: "/mobile/workorders",
                actionLabel: "Work Orders (open job → Diagnosis)",
            },
            {
                title: "Time tracking",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Clock in from the work order detail page or **Mobile → Time Tracking**.",
                            "Only one active time log should run at a time — stop the previous job before starting another.",
                            "Clock out when you leave the bay for breaks, parts pickup, or end of shift.",
                            "Managers use time logs for efficiency reports — accurate clocking protects your productivity metrics.",
                        ],
                    },
                    {
                        type: "mistakes",
                        items: [
                            "Leaving a timer running overnight",
                            "Clocking time to a job you are not actively working on",
                            "Forgetting to clock in on mobile jobs and roadside calls",
                        ],
                    },
                ],
                actionLink: "/mobile/time-tracking",
                actionLabel: "Time Tracking",
            },
            {
                title: "Photo uploads and documentation",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "From the work order, open **Photos** or use **Mobile → Work Order → Photos**.",
                            "Capture before-and-after images for major repairs.",
                            "Label or note what each photo shows if the system allows captions.",
                            "Photos appear on inspection reports and can be shared with customers via the portal.",
                        ],
                    },
                ],
                actionLink: "/mobile/workorders",
                actionLabel: "Mobile Work Orders",
            },
            {
                title: "Parts requests and quality checks",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Request parts from **Parts & Stock → Parts Requests** linked to the work order.",
                            "Wait for allocation or pickup confirmation before removing stock yourself.",
                            "After repairs, perform your own QC walk-around before sending to official **Quality Check**.",
                            "Verify torque specs, fluid levels, warning lights cleared, and road-test if required.",
                            "Return unused parts to the parts desk with the work order reference.",
                        ],
                    },
                ],
                actionLink: "/mobile/workorders",
                actionLabel: "Request Parts from Work Order",
            },
        ],
    },
    {
        id: "service-coordinator",
        title: "Service Coordinator Guide",
        description:
            "Shop floor control: assign technicians, manage workflow, review inspections/diagnosis, and coordinate customer approvals.",
        icon: ClipboardList,
        section: "roles",
        responsibilities: [
            "Assign the right technician to each job based on skill and workload",
            "Advance work orders through the validated repair workflow",
            "Review inspections and diagnosis before customer contact",
            "Send estimates and follow up on customer approvals",
            "Coordinate parts availability with the parts desk",
            "Unblock paused jobs and manage priority changes",
        ],
        keywords: ["coordinator", "assign", "workflow", "approval", "kanban"],
        topics: [
            {
                title: "Your role as service coordinator",
                blocks: [
                    {
                        type: "paragraph",
                        text: "You are the operational hub between reception, technicians, parts, and the customer. Your decisions control bay utilization, approval turnaround, and whether jobs stall in diagnosis or awaiting approval.",
                    },
                ],
                actionLink: "/dashboard",
                actionLabel: "Dashboard",
            },
            {
                title: "Assigning work orders",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Review new jobs in **Draft**, **Intake**, or **Inspection** on the Kanban board.",
                            "Open **Technicians** to see who is available, current workload, and skills.",
                            "Assign a **Primary Technician** and optionally a **Service Coordinator** on the work order.",
                            "Move status to **Assigned** once the technician acknowledges the job.",
                            "For complex jobs, add internal notes about deadlines, parts lead time, or customer expectations.",
                        ],
                    },
                ],
                actionLink: "/workorders/kanban",
                actionLabel: "Kanban Board",
            },
            {
                title: "Workflow and status management",
                blocks: [
                    {
                        type: "paragraph",
                        text: "Work orders follow a validated sequence: Draft → Inspection → Intake → Assigned → Diagnosis → Awaiting Approval → Approved → In Progress → Quality Check → Completed → Invoiced → Closed. You cannot skip steps — for example, you cannot move from Diagnosis directly to Approved without customer sign-off.",
                    },
                    {
                        type: "steps",
                        items: [
                            "Use **Kanban** drag-and-drop only for valid transitions — invalid moves are blocked.",
                            "When technicians find extra work, status returns to **Additional Work Found** then **Awaiting Approval**.",
                            "Use **Paused** when waiting for parts or customer decisions — add a note explaining why.",
                            "Monitor **Workflow health** on the Dashboard for jobs stuck more than 48 hours in one status.",
                        ],
                    },
                ],
                actionLink: "/workorders",
                actionLabel: "Work Orders",
            },
            {
                title: "Inspection and diagnosis review",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open completed inspections and verify photos and critical items are documented.",
                            "Approve or reject inspection reports before they go to the customer.",
                            "Review diagnosis recommendations for pricing accuracy and missing labor lines.",
                            "Ensure diagnostic fees are captured when applicable.",
                            "Convert approved recommendations into an **Estimate** linked to the work order.",
                        ],
                    },
                ],
                actionLink: "/inspections",
                actionLabel: "Inspections",
            },
            {
                title: "Customer estimate approvals",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create or send the **Estimate** from Billing — status should move to **Sent**.",
                            "Customer can approve via the **Customer Portal** or in person at reception.",
                            "When approved, work order status moves to **Approved** and technicians can begin repair.",
                            "If declined, discuss with the customer and revise the estimate or close the job as billable diagnosis only.",
                            "Follow up on estimates in **Awaiting Approval** status daily — stalled approvals idle bays.",
                        ],
                    },
                ],
                actionLink: "/billing/estimates",
                actionLabel: "Estimates",
            },
        ],
    },
    {
        id: "accountant",
        title: "Accountant / Billing Guide",
        description:
            "Financial operations: estimates, invoices, payments, refunds, tills, accounting reports, and reconciliation.",
        icon: Calculator,
        section: "roles",
        responsibilities: [
            "Ensure every completed job is invoiced accurately and on time",
            "Record and allocate payments correctly",
            "Manage tills and daily cash reconciliation",
            "Process refunds with proper approval",
            "Maintain accounting records and run financial reports",
            "Reconcile bank statements with system transactions",
        ],
        keywords: ["billing", "invoice", "payment", "till", "accounting", "reconciliation"],
        topics: [
            {
                title: "Estimates and proforma invoices",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create estimates from the work order or **Billing → Estimates → New**.",
                            "Include parts, labor, taxes, and shop supplies as separate lines where required.",
                            "Send to customer — track status: **Draft**, **Sent**, **Viewed**, **Approved**, **Declined**.",
                            "Use **Invoices → Proforma** (filter or New Proforma) when the customer needs a formal quote document before work starts.",
                            "Convert approved estimates to invoices when the job is complete — avoid double-billing lines.",
                        ],
                    },
                ],
                actionLink: "/billing/estimates",
                actionLabel: "Estimates",
            },
            {
                title: "Invoices and payments",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Generate invoices when work orders reach **Completed** or **Invoiced** status.",
                            "Verify line items match parts issued and labor time logged.",
                            "Record payments via **Billing → Payments** — allocate to the correct invoice.",
                            "Online Paystack payments sync via webhook — verify status before closing the till.",
                            "Use **Partial** status when a deposit was taken and balance remains.",
                        ],
                    },
                ],
                actionLink: "/billing/invoices",
                actionLabel: "Invoices",
            },
            {
                title: "Refunds, tills, and credit notes",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Process refunds from the payment detail page or **Payments → Refunds**.",
                            "Pending refunds require approval — check your branch policy on who approves.",
                            "Open **Accounting → Till Management** at the start of the day; close with counted cash vs. system total.",
                            "Record **Pay In** and **Pay Out** for petty cash movements.",
                            "Issue **Credit Notes** for post-invoice adjustments instead of editing closed invoices.",
                        ],
                    },
                ],
                actionLink: "/accounting/tills",
                actionLabel: "Till Management",
            },
            {
                title: "Accounting reports and reconciliation",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Accounting** for P&L, balance sheet, cash flow, and trial balance.",
                            "Run **Aging Reports** weekly to chase overdue invoices.",
                            "Use **Bank Reconciliation** to match bank statement lines to system payments.",
                            "Export reports to Excel for management or external auditors.",
                            "Sync with **QuickBooks Online** if configured under **Admin → Integrations**.",
                        ],
                    },
                ],
                actionLink: "/accounting",
                actionLabel: "Accounting",
            },
        ],
    },
    {
        id: "parts-manager",
        title: "Parts & Stock Guide",
        description:
            "Stock control: parts catalog, purchase orders, transfers, allocations, counts, and low-stock alerts.",
        icon: Package,
        section: "roles",
        responsibilities: [
            "Maintain accurate stock levels across branches",
            "Process parts requests from technicians promptly",
            "Create and receive purchase orders",
            "Manage inter-branch transfers",
            "Run physical counts and resolve variances",
            "Respond to low-stock alerts before jobs stall",
        ],
        keywords: ["inventory", "parts", "purchase order", "transfer", "stock count"],
        topics: [
            {
                title: "Stock management",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Parts & Stock** to search parts by name, SKU, or barcode.",
                            "Use **Scan Barcode** for fast lookup at the parts counter.",
                            "Review stock quantity, reorder level, and bin location columns.",
                            "Add new parts with correct category, supplier, cost, and sell price.",
                            "Set reorder levels so **Stock Alerts** fire before you run out.",
                        ],
                    },
                ],
                actionLink: "/inventory",
                actionLabel: "Parts & Stock",
            },
            {
                title: "Purchase orders and receiving",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create POs from **Parts & Stock → Purchase Orders → New**.",
                            "Submit for approval if your branch requires manager sign-off.",
                            "When goods arrive, receive against the PO — partial receives are supported.",
                            "Verify quantities and costs match the supplier invoice before marking **Received**.",
                        ],
                    },
                ],
                actionLink: "/inventory/purchase-orders",
                actionLabel: "Purchase Orders",
            },
            {
                title: "Transfers, allocation, and physical counts",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create **Inter-Branch Transfers** when another branch needs stock.",
                            "Track status: **Draft** → **Approved** → **In Transit** → **Received**.",
                            "Fulfill **Parts Requests** from work orders — allocate before technicians pick up.",
                            "Run **Physical Counts** quarterly or when variances are suspected.",
                            "Resolve count variances with adjustment transactions and document the reason.",
                        ],
                    },
                ],
                actionLink: "/inventory/physical-counts",
                actionLabel: "Physical Counts",
            },
        ],
    },
    {
        id: "manager",
        title: "Manager Guide",
        description:
            "Branch oversight: dashboards, KPIs, reporting, approvals, and operational monitoring.",
        icon: UserCog,
        section: "roles",
        responsibilities: [
            "Monitor daily shop performance and cash position",
            "Approve high-value POs, refunds, and exceptions",
            "Review KPIs and act on stalled workflows",
            "Manage branch staff visibility and escalations",
            "Use reports for weekly operational meetings",
        ],
        keywords: ["manager", "kpi", "dashboard", "reports", "approval"],
        topics: [
            {
                title: "Dashboards and KPIs",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Start each day on **Dashboard → What needs action** for overdue approvals, stock alerts, and exceptions.",
                            "Review **Operator snapshot**: open work orders, today's appointments, roadside activity.",
                            "Check **Cash and recurring revenue** for billing health and subscription renewals.",
                            "Use **Workflow health** to spot bottlenecks (e.g., many jobs stuck in Awaiting Approval).",
                        ],
                    },
                ],
                actionLink: "/dashboard",
                actionLabel: "Dashboard",
            },
            {
                title: "Reporting and branch management",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **Reports & Analytics** — Financial, Operational, Inventory, Customers, Vehicles tabs.",
                            "Export or schedule reports for weekly management review.",
                            "Filter by branch if you manage multiple locations.",
                            "Use **Technician performance** reports for coaching and capacity planning.",
                            "Approve POs, refunds, and payroll from respective modules when notifications appear.",
                        ],
                    },
                ],
                actionLink: "/reports",
                actionLabel: "Reports",
            },
        ],
    },
    {
        id: "customer-portal",
        title: "Customer Portal Guide",
        description:
            "Self-service for customers: bookings, work order tracking, estimate approval, and online payments.",
        icon: UserCircle,
        section: "roles",
        responsibilities: [
            "Register and maintain profile and vehicle information",
            "Book service appointments online",
            "Track work order progress",
            "Review and approve estimates",
            "View and pay invoices securely",
        ],
        keywords: ["portal", "customer", "booking", "paystack", "estimate approval"],
        topics: [
            {
                title: "Getting started",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Log in at the customer portal URL provided by your workshop.",
                            "Complete your profile — phone and email must match workshop records for linking.",
                            "Add vehicles under **My Vehicles** with VIN and registration details.",
                            "Enable notifications for estimate and invoice alerts.",
                        ],
                    },
                ],
                actionLink: "/portal",
                actionLabel: "Customer Portal",
            },
            {
                title: "Appointments and work orders",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Use **Book Service** to choose date, time, and service type from available slots.",
                            "View upcoming appointments on the calendar.",
                            "Track active **Work Orders** — status updates mirror the workshop system.",
                            "Open inspection reports shared by the workshop.",
                        ],
                    },
                ],
                actionLink: "/portal/book",
                actionLabel: "Book Service",
            },
            {
                title: "Estimates, invoices, and payments",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "When an estimate is ready, it appears under **Estimates** with **Approve** or **Decline** actions.",
                            "Approved estimates authorize the workshop to proceed with repairs.",
                            "View **Invoices** and pay online via **Paystack** (card, mobile money, bank).",
                            "Download payment receipts from **Payment History**.",
                        ],
                    },
                    {
                        type: "note",
                        text: "Repairs cannot begin on additional work until you approve the revised estimate. Check notifications daily if your vehicle is in the shop.",
                    },
                ],
                actionLink: "/portal/estimates",
                actionLabel: "My Estimates",
            },
        ],
    },
    {
        id: "administrator",
        title: "Administrator Guide",
        description:
            "System administration: users, roles, permissions, integrations, branding, backups, and security.",
        icon: Settings,
        section: "roles",
        responsibilities: [
            "Provision staff accounts with correct roles and branch access",
            "Configure integrations (Paystack, Hubtel, QuickBooks, email)",
            "Maintain branding and system settings",
            "Schedule backups and review audit logs",
            "Enforce security policies including 2FA",
        ],
        keywords: ["admin", "users", "roles", "permissions", "settings", "backup"],
        topics: [
            {
                title: "Users, roles, and permissions",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Add staff via **HR → Add Staff** — user accounts link to employee profiles.",
                            "Assign a **role** and **branch** — branch scope controls which data users see.",
                            "Use **Admin → Roles & Permissions** to customize permission sets by category.",
                            "Enable **Two-Factor Authentication** for admin and finance users.",
                            "Deactivate (don't delete) users who leave — preserves audit history.",
                        ],
                    },
                ],
                actionLink: "/admin/users",
                actionLabel: "User Management",
            },
            {
                title: "Integrations and settings",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Configure Paystack, Hubtel SMS, email SMTP, and QuickBooks under **Settings** and **Integrations**.",
                            "Set business defaults: currency (GHS), tax rates, document numbering per branch.",
                            "Upload logo and brand colors under **Settings → Branding**.",
                            "Review **Audit Log** regularly for sensitive changes.",
                        ],
                    },
                ],
                actionLink: "/admin/settings",
                actionLabel: "System Settings",
            },
            {
                title: "Backups and security",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Create full backups from **Admin → Backups** before major updates.",
                            "Download backup files to off-site storage weekly.",
                            "Set accounting lock dates to prevent retroactive edits after month-end close.",
                            "Configure reCAPTCHA on login if exposed to the public internet.",
                        ],
                    },
                ],
                actionLink: "/admin/backups",
                actionLabel: "System Backups",
            },
        ],
    },
    {
        id: "mobile-technician",
        title: "Mobile Technician App Guide",
        description:
            "Field and bay-side mobile workflows: navigation, job updates, inspections, uploads, and offline use.",
        icon: Smartphone,
        section: "roles",
        responsibilities: [
            "Use mobile views for bay-side and roadside work",
            "Keep job status current from the shop floor",
            "Perform inspections and upload photos from mobile",
            "Sync data when connectivity returns after offline use",
        ],
        keywords: ["mobile", "offline", "sync", "pwa", "technician app"],
        topics: [
            {
                title: "Mobile navigation",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open **/mobile/dashboard** on your phone browser or install the PWA shortcut.",
                            "Main sections: **Dashboard**, **Work Orders**, **Inspections**, **Time Tracking**, **Roadside**.",
                            "The mobile layout is optimized for touch — use it at the vehicle, not the desktop.",
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile Dashboard",
            },
            {
                title: "Updating jobs, inspections, and uploads",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Open an assigned work order and use quick status actions where available.",
                            "Start inspections from **Mobile → Inspections → Perform**.",
                            "Upload photos immediately while at the vehicle — don't wait until end of day.",
                            "Clock time from **Mobile → Time Tracking**.",
                        ],
                    },
                ],
                actionLink: "/mobile/workorders",
                actionLabel: "Mobile Work Orders",
            },
            {
                title: "Offline behavior and troubleshooting",
                blocks: [
                    {
                        type: "paragraph",
                        text: "The mobile app caches recent work orders — including tasks and parts on each job detail — for offline viewing. Changes made offline queue for sync when connectivity returns.",
                    },
                    {
                        type: "troubleshooting",
                        items: [
                            {
                                problem: "Changes not appearing on desktop",
                                solution: "Pull to refresh or wait for sync. Ensure you are logged in and have network connectivity.",
                            },
                            {
                                problem: "Cannot upload photos",
                                solution: "Check camera permissions in browser settings. Reduce photo size if upload times out.",
                            },
                            {
                                problem: "Work orders list empty",
                                solution: "Confirm you are assigned as primary technician and logged into the correct branch.",
                            },
                        ],
                    },
                ],
                actionLink: "/mobile/dashboard",
                actionLabel: "Mobile Dashboard",
            },
        ],
    },
    {
        id: "hr-staff",
        title: "HR Manager Guide (Overview)",
        description:
            "Staff lifecycle: onboarding, leave, attendance, payroll, recruitment, training, and compliance.",
        icon: Users,
        section: "roles",
        responsibilities: [
            "Onboard staff and link user accounts",
            "Process leave and attendance",
            "Run payroll periods",
            "Maintain compliance documents",
        ],
        keywords: ["hr", "payroll", "leave", "staff"],
        topics: [
            {
                title: "HR module essentials",
                blocks: [
                    {
                        type: "steps",
                        items: [
                            "Use **HR → Add Staff** to create employee records — this also provisions system login when configured.",
                            "Manage **Leave** requests — approve or reject with reason.",
                            "Process **Payroll** periods: draft → processing → approved → paid.",
                            "Track **Compliance** document expiry dates for certifications and licenses.",
                            "Technicians are created through HR, not a separate technician-only form.",
                        ],
                    },
                ],
                actionLink: "/hr",
                actionLabel: "HR Dashboard",
            },
        ],
    },
];
