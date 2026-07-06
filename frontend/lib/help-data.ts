import type { NavIcon } from "@/components/layout/nav-group-types";
import {
    Bell,
    Calculator,
    Calendar,
    Car,
    ClipboardList,
    CreditCard,
    FileBarChart,
    FileCheck,
    Landmark,
    LayoutDashboard,
    MessageSquare,
    Package,
    Search,
    Settings,
    ShieldAlert,
    Ticket,
    Truck,
    UserCog,
    Users,
    Wrench,
} from "lucide-react";

export type HelpTopic = {
    title: string;
    steps: string[];
    actionLink?: string;
    actionLabel?: string;
    keywords?: string[];
};

export type HelpModule = {
    id: string;
    title: string;
    description: string;
    icon: NavIcon;
    topics: HelpTopic[];
    keywords?: string[];
};

export const helpContent: Record<string, HelpModule> = {
    admin: {
        id: "admin",
        title: "Admin & Configuration",
        description: "Settings, users, roles, branches, audit logs, backups, integrations, and feedback.",
        icon: Settings,
        keywords: ["configuration", "settings", "admin", "security", "roles", "users", "branches"],
        topics: [
            {
                title: "System settings and integrations",
                steps: [
                    "Open Settings to edit grouped system values such as branding, email, business defaults, and other configuration keys.",
                    "Use Save Changes after editing settings. The button shows a count when unsaved values are present.",
                    "Use Email Templates from Settings when you need to manage message templates.",
                    "Open Integrations to edit integration settings in grouped rows, then use Save Changes for pending edits.",
                    "Use Skills and Asset Categories from the settings subpages when configuring staff skills or fixed-asset categories.",
                ],
                actionLink: "/admin/settings",
                actionLabel: "Open Settings",
                keywords: ["branding", "email templates", "integrations", "skills", "asset categories"],
            },
            {
                title: "Users, roles, and permissions",
                steps: [
                    "Open User Management to search and filter users by role, status, branch, and two-factor authentication state.",
                    "New staff users are added through HR by using Add via HR, which opens the staff creation flow.",
                    "Use the user row menu to view, edit, activate or deactivate, manage two-factor authentication, or delete a user when permissions allow.",
                    "Open Roles & Permissions to create custom roles, edit role metadata, and manage permission assignments by category.",
                    "System roles cannot be deleted, and roles with assigned users must be reassigned before deletion.",
                ],
                actionLink: "/admin/users",
                actionLabel: "Manage Users",
                keywords: ["2fa", "activate", "deactivate", "permission", "rbac"],
            },
            {
                title: "Branches and operational controls",
                steps: [
                    "Open Branch Management to create, view, edit, or archive branches.",
                    "Branch archive uses a typed confirmation so the branch name must match before the action is accepted.",
                    "Workflow Builder is currently parked. The page says work orders continue to use the validated repair flow instead of the workflow engine.",
                ],
                actionLink: "/admin/branches",
                actionLabel: "Open Branch Management",
                keywords: ["branches", "workflow builder"],
            },
            {
                title: "Audit logs, backups, imports, and feedback",
                steps: [
                    "Open Audit Log to filter by action, search text, and date range, then view detail changes for individual audit events.",
                    "Use audit export buttons to download CSV or Excel log files, or delete old logs after choosing an age threshold.",
                    "Open System Backups to create full backups, filter backup history, download completed files, or delete backup records.",
                    "Open Import History to review import audit entries and export the current import history list.",
                    "Open Customer Feedback to review feedback by type/status, print branch QR posters, and update feedback status or internal notes.",
                ],
                actionLink: "/admin/audit-log",
                actionLabel: "View Audit Log",
                keywords: ["backup", "import history", "feedback", "qr", "audit"],
            },
        ],
    },
    dashboard: {
        id: "dashboard",
        title: "Dashboard",
        description: "Action-first overview of operational, cash, recurring revenue, and workflow health.",
        icon: LayoutDashboard,
        keywords: ["home", "overview", "snapshot", "workflow health"],
        topics: [
            {
                title: "Reading the dashboard",
                steps: [
                    "Use What needs action first to jump into urgent work such as approvals, overdue items, or operational exceptions.",
                    "Use Operator snapshot for current shop activity such as work orders, appointments, stock alerts, and roadside activity.",
                    "Use Cash and recurring revenue for billing and subscription indicators, with quick links to Billing and Reports.",
                    "Use Workflow health to review recent work-order status movement across the last 30 days.",
                ],
                actionLink: "/dashboard",
                actionLabel: "Open Dashboard",
            },
            {
                title: "Finding records quickly",
                steps: [
                    "Use the global search trigger in the top navigation or press Ctrl+K.",
                    "Search can route you to supported records such as customers, vehicles, work orders, and inventory.",
                    "Use the sidebar for navigation. Items are permission-gated, so unavailable areas may be hidden.",
                ],
                actionLink: "/search",
                actionLabel: "Open Search",
                keywords: ["ctrl k", "command palette", "global search"],
            },
        ],
    },
    customers: {
        id: "customers",
        title: "Customers",
        description: "Customer list, contacts, imports, exports, filters, and customer creation.",
        icon: Users,
        keywords: ["contacts", "customer import", "customer export"],
        topics: [
            {
                title: "Managing the customer list",
                steps: [
                    "Open Customers to search by customer details and use advanced filters such as status, customer type, created date, and inactive period.",
                    "Use quick filters to switch common customer segments without rebuilding filters manually.",
                    "Use the row actions to view, edit, message, schedule, inspect work orders, or delete when your permissions allow.",
                    "Open Contacts from the Customers page when you need the contacts-focused view.",
                ],
                actionLink: "/customers",
                actionLabel: "View Customers",
            },
            {
                title: "Creating and importing customers",
                steps: [
                    "Use Add Customer to create a customer profile.",
                    "The customer form supports account status, customer type, contact details, billing information, generated passwords, and welcome email options.",
                    "Use Import Excel to upload a customer workbook that matches the provided template.",
                    "Use Export Excel or Export PDF to export the current list results.",
                ],
                actionLink: "/customers/new",
                actionLabel: "Add Customer",
                keywords: ["welcome email", "password", "xlsx", "pdf"],
            },
        ],
    },
    vehicles: {
        id: "vehicles",
        title: "Vehicles",
        description: "Fleet records, VIN decoding, VIN scanning, service-due filters, imports, and exports.",
        icon: Car,
        keywords: ["fleet", "vin", "service due"],
        topics: [
            {
                title: "Using Fleet Management",
                steps: [
                    "Open Vehicles to search fleet records and switch between quick filters such as active, inactive, and services due.",
                    "Use Fleet Filters for status, make, model, year range, engine type, created date, days ahead, and due service type.",
                    "Use row actions to view, edit, inspect history, or delete vehicles when your permissions allow.",
                    "Use Export Excel or Export PDF to export fleet data, and Import Excel to upload vehicles from a workbook.",
                ],
                actionLink: "/vehicles",
                actionLabel: "View Vehicles",
            },
            {
                title: "Adding vehicles with VIN tools",
                steps: [
                    "Use Add Vehicle to create a vehicle profile.",
                    "Enter the 17-character VIN and use Decode VIN to pull available make, model, year, trim, engine, transmission, and extra VIN data.",
                    "Use the VIN scanner button to capture a VIN barcode from the camera when supported.",
                    "The form checks duplicate VINs before saving a new vehicle.",
                ],
                actionLink: "/vehicles/new",
                actionLabel: "Add Vehicle",
                keywords: ["decode vin", "scan vin", "duplicate vin"],
            },
        ],
    },
    appointments: {
        id: "appointments",
        title: "Appointments",
        description: "Appointment list, calendar view, scheduling, filters, exports, and bulk status updates.",
        icon: Calendar,
        keywords: ["calendar", "schedule", "bulk status"],
        topics: [
            {
                title: "Scheduling and viewing appointments",
                steps: [
                    "Open Appointments to search and filter appointments by status, date range, service type, and branch-aware data.",
                    "Use Calendar View to switch from the table view to the calendar page.",
                    "Use New Appointment to create a scheduled appointment.",
                    "Use row actions to view, edit, or delete an appointment when allowed.",
                ],
                actionLink: "/appointments",
                actionLabel: "View Appointments",
            },
            {
                title: "Bulk actions and exports",
                steps: [
                    "Select appointments in the table to reveal bulk actions.",
                    "Use bulk status update to move selected appointments to a new status.",
                    "Use bulk delete when selected appointments should be removed.",
                    "Use Export Excel or Export PDF from the appointments header.",
                ],
                actionLink: "/appointments/calendar",
                actionLabel: "Calendar View",
            },
        ],
    },
    workorders: {
        id: "workorders",
        title: "Work Orders",
        description: "Repair jobs, list and Kanban views, filters, bulk status updates, printing, diagnosis, and repair pages.",
        icon: ClipboardList,
        keywords: ["repair", "kanban", "diagnosis", "repairs", "print"],
        topics: [
            {
                title: "Managing work orders",
                steps: [
                    "Open Work Orders to search, sort, and filter jobs by status, priority, customer, technician, and created date.",
                    "Use New Work Order to create a job from the staff dashboard.",
                    "Use the row actions to view, edit, print, open diagnosis, or open repairs depending on status and permissions.",
                    "Use Export Excel or Export PDF to export the current work-order list.",
                ],
                actionLink: "/workorders",
                actionLabel: "View Work Orders",
            },
            {
                title: "Kanban and bulk status updates",
                steps: [
                    "Open Kanban Board to drag work orders between implemented status columns.",
                    "Filter Kanban by technician, priority, or My Tasks.",
                    "From the list view, select work orders to update status or delete in bulk.",
                    "Status options include draft/requested style intake states, assigned, diagnosis, awaiting approval, approved, in progress, quality check, completed, invoiced, closed, and cancelled states as configured in the page.",
                ],
                actionLink: "/workorders/kanban",
                actionLabel: "Open Kanban",
                keywords: ["drag", "bulk update", "status"],
            },
        ],
    },
    inspections: {
        id: "inspections",
        title: "Inspections",
        description: "Digital vehicle inspections, templates, perform flow, status filters, and printable reports.",
        icon: FileCheck,
        keywords: ["dvi", "templates", "green", "yellow", "red"],
        topics: [
            {
                title: "Running inspections",
                steps: [
                    "Open Vehicle Inspections to search inspections and filter by status or overall result.",
                    "Use New Inspection to create an inspection record.",
                    "Open an inspection to view it, or use the perform route to complete checklist items.",
                    "Inspection item controls support good, attention, and critical style statuses, notes, and photos.",
                ],
                actionLink: "/inspections",
                actionLabel: "View Inspections",
            },
            {
                title: "Templates and reports",
                steps: [
                    "Open Templates from the inspections header to manage reusable inspection templates.",
                    "Use New Template to create a checklist template.",
                    "Use Print Report from an inspection row to open the printable inspection document.",
                    "Implemented status filters include draft, in progress, completed, approved, and rejected.",
                ],
                actionLink: "/inspections/templates",
                actionLabel: "Manage Templates",
            },
        ],
    },
    inventory: {
        id: "inventory",
        title: "Inventory",
        description: "Parts, barcode scanning, imports, suppliers, purchase orders, transfers, categories, and bundles.",
        icon: Package,
        keywords: ["parts", "stock", "barcode", "supplier", "purchase order", "transfer", "bundle"],
        topics: [
            {
                title: "Parts and stock list",
                steps: [
                    "Open Inventory to search parts, use inventory filters, and review stock-related columns.",
                    "Use Scan Barcode to scan a barcode or QR code into inventory search.",
                    "Use Add Part to create a new part.",
                    "Use Import Excel, Export Excel, Export PDF, or Export for Import for the parts list.",
                    "Select multiple parts to delete in bulk when allowed.",
                ],
                actionLink: "/inventory",
                actionLabel: "Open Inventory",
            },
            {
                title: "Suppliers, POs, transfers, and bundles",
                steps: [
                    "Open Suppliers to add, view, edit, or delete supplier records.",
                    "Open Purchase Orders to create new POs, filter by status, view/edit records, and print purchase orders.",
                    "Open Inter-Branch Transfers to create transfers between branches and track transfer status.",
                    "Open Bundles to create service bundles that group parts and service items.",
                    "Export buttons on some inventory subpages are present but currently show a coming-soon notification instead of downloading a file.",
                ],
                actionLink: "/inventory/purchase-orders",
                actionLabel: "Purchase Orders",
                keywords: ["suppliers", "po", "transfers", "bundles", "coming soon"],
            },
        ],
    },
    billing: {
        id: "billing",
        title: "Billing",
        description: "Invoices, estimates, payments, refunds, bills, credit notes, and tills.",
        icon: CreditCard,
        keywords: ["invoice", "estimate", "payment", "refund", "till", "proforma", "bill"],
        topics: [
            {
                title: "Invoices and estimates",
                steps: [
                    "Open Invoices to search, filter, export, print, download aging reports, bulk send, and create new invoices.",
                    "Open Estimates to search, filter by status, export, bulk send, bulk update status, and create new estimates.",
                    "Invoice and estimate detail pages include view/edit actions and printable document flows.",
                    "Bulk send is permission-gated and uses the selected records from the table.",
                ],
                actionLink: "/billing/invoices",
                actionLabel: "View Invoices",
            },
            {
                title: "Payments, refunds, bills, and tills",
                steps: [
                    "Open Payments to review receipts, allocations, and payment history — use Refunds from the Payments page for till refund approvals.",
                    "Payment details support printing receipts and processing a full or partial refund for completed payments.",
                    "Open Vendor Bills and Credit Notes for AP documents and customer credit memos.",
                    "Create proforma documents from Invoices (Proforma filter or New Proforma) when a formal quote is needed before work starts.",
                    "Open Accounting Till Management to open or close tills, record pay in and pay out movements, review daily reconciliation, and monitor shortages or excesses.",
                ],
                actionLink: "/billing/payments",
                actionLabel: "View Payments",
                keywords: ["receipt", "aging report", "refund approval"],
            },
        ],
    },
    accounting: {
        id: "accounting",
        title: "Accounting",
        description: "Financial overview, chart of accounts, journal entries, accruals, budgets, controls, transfers, reconciliation, and reports.",
        icon: Calculator,
        keywords: ["ledger", "journal", "accrual", "budget", "reconciliation", "quickbooks"],
        topics: [
            {
                title: "Financial overview and reports",
                steps: [
                    "Open Accounting to review cash on hand, net profit, revenue, expenses, trends, and operational financial cards.",
                    "Use Sync from QuickBooks to trigger a QuickBooks Online sync when configured.",
                    "Use Export Report from the accounting overview to download the overview report.",
                    "Use accounting report pages for profit and loss, balance sheet, cash flow, trial balance, tax, aging, expense breakdown, and job profitability.",
                ],
                actionLink: "/accounting",
                actionLabel: "Open Accounting",
            },
            {
                title: "Ledger tools",
                steps: [
                    "Open Chart of Accounts to create or edit accounts and toggle account active state.",
                    "Open Journal Entries to create new entries and reverse posted entries.",
                    "Open Accruals to review active accruals, create manual accruals, create accruals from candidates, and reverse accruals.",
                    "Open Budgets to create budgets, approve draft budgets, view details, and open budget reports.",
                    "Open Controls & Compliance to save accounting lock dates and post closing entries.",
                ],
                actionLink: "/accounting/journal-entries",
                actionLabel: "Journal Entries",
            },
            {
                title: "Banking and fund movement",
                steps: [
                    "Open Bank Reconciliation to create statement records and reconcile or view existing statements.",
                    "Inside a reconciliation, use unmatched and matched views, match bank lines, or create and match missing transactions.",
                    "Open Fund Transfers to create transfers between accounts and review transfer history.",
                    "Open Till Management to manage cash-account till sessions and daily reconciliation.",
                ],
                actionLink: "/accounting/tills",
                actionLabel: "Till Management",
            },
        ],
    },
    fixedassets: {
        id: "fixedassets",
        title: "Fixed Assets",
        description: "Asset register, categories, valuation report, and asset detail/edit flows.",
        icon: Landmark,
        keywords: ["assets", "depreciation", "valuation"],
        topics: [
            {
                title: "Managing fixed assets",
                steps: [
                    "Open Fixed Assets to review the asset register and asset valuation indicators.",
                    "Use Add Asset to create an asset when you have the create-assets permission.",
                    "Open an asset to view detail, or use the edit route to update asset information.",
                    "Open Categories to manage fixed-asset categories.",
                ],
                actionLink: "/fixed-assets",
                actionLabel: "View Assets",
            },
            {
                title: "Valuation reporting",
                steps: [
                    "Use the Valuation Report action from Fixed Assets to open the valuation report page.",
                    "Use the report to review current asset valuation data separate from the main register.",
                    "Keep category and acquisition information current so valuation reporting remains useful.",
                ],
                actionLink: "/fixed-assets/reports/valuation",
                actionLabel: "Valuation Report",
            },
        ],
    },
    subscriptions: {
        id: "subscriptions",
        title: "Subscriptions",
        description: "Service subscriptions, packages, renewals, plan changes, cancellation, and deletion.",
        icon: CreditCard,
        keywords: ["membership", "package", "renew", "plan"],
        topics: [
            {
                title: "Managing subscriptions",
                steps: [
                    "Open Subscriptions to search and filter by payment state.",
                    "Use New Subscription to create a subscription through the create dialog.",
                    "Use row actions to view details, renew, change plan, cancel, or permanently delete a subscription.",
                    "Renewal creates a pending invoice before the new period starts.",
                ],
                actionLink: "/subscriptions",
                actionLabel: "View Subscriptions",
            },
            {
                title: "Managing packages",
                steps: [
                    "Open Packages to manage the subscription packages that subscriptions can use.",
                    "Create or update packages before changing a customer's subscription plan.",
                    "Use plan change from a subscription row to choose a new package.",
                ],
                actionLink: "/subscriptions/packages",
                actionLabel: "Manage Packages",
            },
        ],
    },
    technicians: {
        id: "technicians",
        title: "Technicians",
        description: "Technician roster, assignment metrics, status filters, branch filters, grid/list views, and HR staff onboarding.",
        icon: Wrench,
        keywords: ["staff", "assigned", "available", "skills"],
        topics: [
            {
                title: "Using the technician roster",
                steps: [
                    "Open Technicians to search technicians and filter by current status or branch.",
                    "Switch between grid and list views using the view toggle.",
                    "Use the roster cards or table to review assigned jobs, completed work, availability, and current status.",
                    "Open a technician profile to view performance metrics, job history, certifications, and schedule components.",
                ],
                actionLink: "/technicians",
                actionLabel: "View Technicians",
            },
            {
                title: "Adding technicians",
                steps: [
                    "Technicians are added through HR staff onboarding, not from a separate technician-only form.",
                    "Use Add Technician from the technician empty state or Add Staff from HR to create the staff record.",
                    "Assign skills from the technician skills/settings pages when available for your permissions.",
                ],
                actionLink: "/hr/staff/new",
                actionLabel: "Add via HR",
                keywords: ["onboarding", "hr", "skills"],
            },
        ],
    },
    hr: {
        id: "hr",
        title: "Human Resources",
        description: "Staff, departments, positions, leave, attendance, payroll, recruitment, performance, training, and compliance.",
        icon: UserCog,
        keywords: ["staff", "payroll", "leave", "attendance", "recruitment", "training"],
        topics: [
            {
                title: "HR dashboard and staff",
                steps: [
                    "Open HR to review staff totals, pending leave, today's attendance, expiring compliance documents, and open positions.",
                    "Use Add Staff to create a staff member.",
                    "Open Staff to search, filter, switch grid/list view, open the org chart, bulk update status, or bulk delete staff.",
                    "Open Departments & Positions to create, edit, or delete departments and positions.",
                ],
                actionLink: "/hr",
                actionLabel: "Open HR",
            },
            {
                title: "Leave, attendance, and payroll",
                steps: [
                    "Open Leave Management to apply leave, approve or reject pending requests, filter by status, and manage Leave Types.",
                    "Open Attendance to review daily attendance and time-tracking information.",
                    "Open Payroll to create payroll periods, process payroll, edit periods, mark payroll paid, reverse payroll, or delete a period when allowed.",
                    "Open Payroll Components to manage salary components used by payroll.",
                ],
                actionLink: "/hr/payroll",
                actionLabel: "Open Payroll",
            },
            {
                title: "Recruitment, reviews, training, and compliance",
                steps: [
                    "Open Recruitment to post jobs, edit/delete job openings, view applicants, and delete applicants.",
                    "Open Performance Reviews to initiate reviews and delete review records.",
                    "Open Training to create programs, edit/delete programs, and review available or assigned training.",
                    "Open Compliance to upload documents, edit document metadata, download document files, and track expiring documents.",
                ],
                actionLink: "/hr/recruitment",
                actionLabel: "Open Recruitment",
            },
        ],
    },
    roadside: {
        id: "roadside",
        title: "Roadside Assistance",
        description: "Roadside request list, filters, request creation, dispatch status, technician view, and subscription coverage flags.",
        icon: Truck,
        keywords: ["dispatch", "towing", "battery", "flat tyre", "subscription coverage"],
        topics: [
            {
                title: "Managing roadside requests",
                steps: [
                    "Open Roadside to search and filter requests by status, service type, subscription coverage, and created date.",
                    "Use quick filters such as New Requests and active request views.",
                    "Use New Request to create a roadside request.",
                    "Use row actions to view, edit, or delete a request. Delete is only shown for requested items before dispatch.",
                    "The Export Excel menu item currently shows a coming-soon notification.",
                ],
                actionLink: "/roadside",
                actionLabel: "View Roadside",
            },
            {
                title: "Technician roadside view",
                steps: [
                    "Open Technician View to see active requested, dispatched, en route, on site, and in-progress roadside jobs.",
                    "Use the status actions in the technician view to move a request through the field-service flow.",
                    "Open a request detail page to review customer, vehicle, location, billing, and status information.",
                ],
                actionLink: "/roadside/technician",
                actionLabel: "Technician View",
                keywords: ["en route", "on site", "field service"],
            },
        ],
    },
    gatepasses: {
        id: "gatepasses",
        title: "Gate Passes",
        description: "Vehicle release passes linked to work orders, status filters, creation, edits, and deletion.",
        icon: Ticket,
        keywords: ["release", "vehicle exit", "pass"],
        topics: [
            {
                title: "Using gate passes",
                steps: [
                    "Open Gate Passes to search and filter passes by status and created date.",
                    "Use New Gate Pass to create a pass.",
                    "Open a gate pass row to view it, or use row actions to edit or delete when allowed.",
                    "Gate pass rows link back to the related work order when available.",
                ],
                actionLink: "/gatepass",
                actionLabel: "View Gate Passes",
            },
        ],
    },
    diagnosis: {
        id: "diagnosis",
        title: "Diagnosis",
        description: "Diagnosis session list with search, status filtering, sorting, fees, and work-order links.",
        icon: Search,
        keywords: ["diagnostic", "complaint", "fee"],
        topics: [
            {
                title: "Reviewing diagnosis sessions",
                steps: [
                    "Open Diagnosis to search active diagnosis records.",
                    "Filter by all, in progress, completed, or on hold status.",
                    "Sort by newest, oldest, highest fee, or lowest fee.",
                    "Open a diagnosis row to review the linked diagnosis detail.",
                ],
                actionLink: "/diagnosis",
                actionLabel: "Open Diagnosis",
            },
        ],
    },
    servicesdue: {
        id: "servicesdue",
        title: "Services Due",
        description: "Upcoming and overdue vehicle service schedules with reminder actions.",
        icon: Bell,
        keywords: ["maintenance", "reminder", "overdue", "due soon"],
        topics: [
            {
                title: "Tracking due services",
                steps: [
                    "Open Services Due to review vehicle service schedules that are due or upcoming.",
                    "Filter by days ahead, service type, and search text.",
                    "Use the status badge to distinguish overdue, due soon, and later service items.",
                    "Open the linked vehicle from the table to review the vehicle profile.",
                ],
                actionLink: "/services-due",
                actionLabel: "View Services Due",
            },
            {
                title: "Sending reminders",
                steps: [
                    "Use the reminder action on a due service row to open the Send Service Reminder dialog.",
                    "Confirm the reminder to trigger the reminder mutation for that service schedule.",
                    "Clear filters if expected service schedules are hidden.",
                ],
                actionLink: "/services-due",
                actionLabel: "Open Services Due",
            },
        ],
    },
    reports: {
        id: "reports",
        title: "Reports & Analytics",
        description: "Financial, operational, inventory, customer, vehicle, and controls reporting with exports and schedules.",
        icon: FileBarChart,
        keywords: ["analytics", "export", "schedule", "saved report"],
        topics: [
            {
                title: "Using report tabs",
                steps: [
                    "Open Reports & Analytics and choose a tab: Financial, Operational, Inventory, Customers, Vehicles, or Controls.",
                    "Use the date range and branch controls to change report parameters.",
                    "Financial reporting includes invoice, payment, revenue, technician revenue, and profit-margin views.",
                    "Operational reporting includes work orders by status, work-order summary, technician performance, and appointment statistics.",
                    "Controls reporting includes export logs and audit-related panels.",
                ],
                actionLink: "/reports",
                actionLabel: "Open Reports",
            },
            {
                title: "Saving, scheduling, and exporting",
                steps: [
                    "Use Save to save the current report view with a name and description.",
                    "Use Schedule to create a recurring report schedule with recipients and a frequency.",
                    "Use Export to generate and download the current report output.",
                    "The page records export status in the reporting audit trail.",
                ],
                actionLink: "/reports",
                actionLabel: "Reports",
            },
        ],
    },
    sms: {
        id: "sms",
        title: "SMS Console",
        description: "Manual SMS composition, customer recipient selection, scheduling, and SMS logs.",
        icon: MessageSquare,
        keywords: ["message", "scheduled sms", "recipients", "templates"],
        topics: [
            {
                title: "Sending SMS messages",
                steps: [
                    "Open SMS Console to compose a message.",
                    "Add recipients manually or search/select customers with phone numbers.",
                    "Use Schedule when the message should be sent later.",
                    "Use Send Message or Schedule after at least one recipient and message text are present.",
                ],
                actionLink: "/sms",
                actionLabel: "Open SMS",
            },
            {
                title: "Logs and templates",
                steps: [
                    "Review the SMS log table to see sent or scheduled message records.",
                    "Use row actions where available to inspect or delete log records.",
                    "Open SMS Templates to manage reusable SMS template content.",
                ],
                actionLink: "/sms/templates",
                actionLabel: "SMS Templates",
            },
        ],
    },
    notifications: {
        id: "notifications",
        title: "Notifications",
        description: "Notification center and notification preferences.",
        icon: Bell,
        keywords: ["alerts", "preferences"],
        topics: [
            {
                title: "Viewing notifications",
                steps: [
                    "Use the notification dropdown in the top navigation for recent alerts.",
                    "Open Notifications for the full notification list.",
                    "Open Notification Preferences to adjust notification settings when the route is available to your role.",
                ],
                actionLink: "/notifications",
                actionLabel: "Open Notifications",
            },
        ],
    },
    security: {
        id: "security",
        title: "Security Notes",
        description: "Permission-gated screens, protected routes, two-factor state, and audit visibility.",
        icon: ShieldAlert,
        keywords: ["permissions", "protected", "2fa", "audit"],
        topics: [
            {
                title: "Understanding permission-gated actions",
                steps: [
                    "Sidebar items and action buttons are hidden or disabled based on the signed-in user's permissions.",
                    "If a documented button is missing, check the user's role and assigned permissions first.",
                    "User Management shows whether two-factor authentication is enabled or disabled for each account.",
                    "Audit Log and some admin actions require dedicated audit or management permissions.",
                ],
                actionLink: "/admin/roles",
                actionLabel: "Review Roles",
            },
        ],
    },
};
