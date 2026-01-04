
import {
    ClipboardList, Package, CreditCard, Users, Car, Calendar,
    BarChart3, Settings, Truck, Wrench, Search, LayoutDashboard, FileCheck
} from "lucide-react";

export type HelpTopic = {
    title: string;
    steps: string[];
    actionLink?: string;
    actionLabel?: string;
};

export type HelpModule = {
    id: string;
    title: string;
    description: string;
    icon: any;
    topics: HelpTopic[];
};

export const helpContent: Record<string, HelpModule> = {
    dashboard: {
        id: "dashboard",
        title: "Getting Started",
        description: "Overview of the main dashboard and navigation.",
        icon: LayoutDashboard,
        topics: [
            {
                title: "Dashboard Overview",
                steps: [
                    "The Home Dashboard gives you a high-level view of your shop's performance.",
                    "Check 'Daily Sales' and 'Car Count' widgets for immediate activity.",
                    "View 'Recent Activity' for the latest system updates.",
                    "Use the sidebar navigation to access all modules (Work Orders, Inventory, etc.).",
                ],
                actionLink: "/dashboard",
                actionLabel: "Go to Dashboard"
            },
            {
                title: "Global Search",
                steps: [
                    "Use the search bar in the top navigation or press 'Cmd+K' / 'Ctrl+K'.",
                    "Search for Customers, Vehicles, Work Orders, or Inventory parts.",
                    "Select a result to jump directly to that record.",
                ],
            }
        ]
    },
    workorders: {
        id: "workorders",
        title: "Work Orders",
        description: "Manage repair jobs, assignments, and tracking.",
        icon: ClipboardList,
        topics: [
            {
                title: "Creating a Work Order",
                steps: [
                    "Click 'New Work Order' from the dashboard",
                    "Select an existing customer or create a new one",
                    "Select the vehicle for service and reported issues",
                    "Save as 'Draft' to prepare or 'Pending' to start workflow"
                ],
                actionLink: "/workorders/new",
                actionLabel: "Create Work Order"
            },
            {
                title: "Workflow & Lifecycle",
                steps: [
                    "**Draft**: Initial creation, not yet active.",
                    "**Inspection/Intake**: Vehicle check-in and DVI.",
                    "**Diagnosis**: Identifying root cause.",
                    "**Awaiting Approval**: Estimate sent to customer.",
                    "**Approved**: Work authorized by customer.",
                    "**In Progress**: Repairs underway.",
                    "**Quality Check**: Final verification.",
                    "**Completed**: Work done, ready for pickup.",
                    "**Invoiced**: Final invoice generated.",
                    "**Closed**: Transaction finalized."
                ]
            },
            {
                title: "Tech Mode",
                steps: [
                    "Technicians can use 'Tech Mode' for a focused view",
                    "View assigned tasks, parts, and labor hours",
                    "Log time and update status"
                ],
                actionLink: "/workorders",
                actionLabel: "View Work Orders"
            }
        ]
    },
    inspections: {
        id: "inspections",
        title: "Inspections (DVI)",
        description: "Digital vehicle inspections and checklists.",
        icon: FileCheck,
        topics: [
            {
                title: "Performing an Inspection",
                steps: [
                    "Go to Inspections → 'New Inspection'",
                    "Select the Work Order or Vehicle to inspect",
                    "Choose an Inspection Template (e.g., 'Multipoint Inspection')",
                    "Go through each checklist item, marking Green/Yellow/Red",
                    "Add photos and notes to any flagged items",
                    "Save and share the report with the customer via email/SMS",
                ],
                actionLink: "/inspections/new",
                actionLabel: "Start Inspection"
            },
            {
                title: "Managing Templates",
                steps: [
                    "Go to Inspections → Templates",
                    "Create reusable checklists for different service types (Oil Change, Brake Check, etc.)",
                    "Define categories (Under Hood, Tires, Interior) and items",
                    "Set default 'Requires Photo' flags for critical items",
                ],
                actionLink: "/inspections/templates",
                actionLabel: "Manage Templates"
            }
        ]
    },
    inventory: {
        id: "inventory",
        title: "Inventory",
        description: "Track parts, stock levels, and purchase orders.",
        icon: Package,
        topics: [
            {
                title: "Managing Parts",
                steps: [
                    "Go to Inventory → Parts → 'New Part'",
                    "Enter part details, cost, and selling price",
                    "Set reorder points for automatic alerts",
                    "View stock levels and adjust manually if needed"
                ],
                actionLink: "/inventory",
                actionLabel: "Go to Inventory"
            },
            {
                title: "Purchase Order Cycle",
                steps: [
                    "**Draft**: Create PO, add items, select supplier.",
                    "**Submitted**: Finalize and send to supplier.",
                    "**Confirm Receipt**: When goods arrive, click 'Confirm Receipt'. System automatically updates stock levels for all items.",
                    "**Cancelled**: Orders can be cancelled if not yet received."
                ],
                actionLink: "/inventory/purchase-orders",
                actionLabel: "Manage POs"
            }
        ]
    },
    billing: {
        id: "billing",
        title: "Billing",
        description: "Invoices, payments, refunds, and estimates.",
        icon: CreditCard,
        topics: [
            {
                title: "Generating Invoices",
                steps: [
                    "Complete a work order (set status to 'Completed')",
                    "Click 'Generate Invoice' button",
                    "Review invoice preview: check customer info, line items, taxes",
                    "Adjust discount or add late fees if needed",
                    "Choose payment terms (Due on Receipt, Net 15, Net 30)",
                    "Click 'Send Invoice' to email customer or 'Print' for hard copy",
                ],
            },
            {
                title: "Recording Payments",
                steps: [
                    "Navigate to Billing → Invoices",
                    "Find unpaid/partially paid invoice",
                    "Click 'Record Payment' button",
                    "Select payment method (Cash, Check, Card, Bank Transfer)",
                    "Enter amount received (can be partial payment)",
                    "Add reference number (check #, transaction ID)",
                    "Click 'Save' - remaining balance updates automatically",
                ],
            },
            {
                title: "Handling Refunds",
                steps: [
                    "Locate the original invoice",
                    "Click 'Issue Refund' button",
                    "Select refund reason and enter amount",
                    "Choose refund method (same as original payment or different)",
                    "Add notes explaining the refund",
                    "Refund is recorded as a credit memo linked to original invoice",
                ],
            },
        ],
    },
    customers: {
        id: "customers",
        title: "Customers",
        description: "Client profiles, history, and communication.",
        icon: Users,
        topics: [
            {
                title: "Adding New Customers",
                steps: [
                    "Go to Customers → 'New Customer'",
                    "Enter basic info: name, email, phone",
                    "Add address details for invoicing",
                    "Set customer type (Individual, Business, Fleet)",
                    "Add payment terms and preferred contact method",
                    "Save to create customer profile",
                ],
                actionLink: "/customers/new",
                actionLabel: "Add Customer"
            },
            {
                title: "Viewing Customer History",
                steps: [
                    "Click on a customer from the list",
                    "View dashboard showing: total spent, outstanding balance, number of visits",
                    "Switch between tabs: Work Orders, Invoices, Vehicles, Appointments",
                    "Filter by date range to see specific periods",
                    "Export customer history as PDF report",
                ],
            },
        ],
    },
    vehicles: {
        id: "vehicles",
        title: "Vehicles",
        description: "Fleet management, service history, and VIN decoding.",
        icon: Car,
        topics: [
            {
                title: "Adding Vehicles",
                steps: [
                    "Navigate to Vehicles → 'New Vehicle'",
                    "Enter VIN and click 'Decode' to auto-fill details",
                    "If decoder unavailable, manually enter make, model, year",
                    "Link vehicle to owner (customer)",
                    "Add license plate, color, mileage",
                    "Upload vehicle photos if needed",
                    "Save vehicle profile",
                ],
                actionLink: "/vehicles/new",
                actionLabel: "Add Vehicle"
            },
            {
                title: "Tracking Service History",
                steps: [
                    "Open vehicle profile",
                    "View 'Service History' tab",
                    "See chronological list of all work orders",
                    "Filter by service type or date range",
                    "View upcoming maintenance recommendations",
                    "Export service history as PDF for customer",
                ],
            },
        ],
    },
    technicians: {
        id: "technicians",
        title: "Technicians",
        description: "Manage staff, skills, and efficiency.",
        icon: Wrench,
        topics: [
            {
                title: "Onboarding Technicians",
                steps: [
                    "Go to Technicians → 'New Technician'",
                    "Enter personal details and employment start date",
                    "Assign 'Skills' (e.g., Electrical, Engine, Tire) to help with job scheduling",
                    "Set hourly cost rate for profitability calculations",
                ],
                actionLink: "/technicians/new",
                actionLabel: "Add Technician"
            },
            {
                title: "Tracking Efficiency",
                steps: [
                    "View Technician profile to see Efficiency metrics (Billed Hours / Worked Hours)",
                    "Monitor current active jobs and status",
                    "Review historical job performance and warranty return rates",
                ],
            }
        ]
    },
    roadside: {
        id: "roadside",
        title: "Roadside Assistance",
        description: "Dispatch and manage emergency service requests.",
        icon: Truck,
        topics: [
            {
                title: "Dispatch Lifecycle",
                steps: [
                    "**Requested**: New request logged via phone or app.",
                    "**Dispatched**: Technician assigned. Status -> 'Dispatched'.",
                    "**En Route/On Site**: Technician travel and arrival updates.",
                    "**In Progress**: Service being performed.",
                    "**Completed**: Service done, invoice generated automatically.",
                    "**Cancelled**: Request aborted."
                ],
                actionLink: "/roadside",
                actionLabel: "View Requests"
            },
            {
                title: "Technician View",
                steps: [
                    "Drivers use the mobile-friendly '/roadside/technician' view",
                    "One-tap status updates (En Route, Arrived, Start, Complete)",
                    "View customer details and map location",
                    "Upload service photos"
                ],
                actionLink: "/roadside/technician",
                actionLabel: "Driver View"
            }
        ]
    },
    appointments: {
        id: "appointments",
        title: "Appointments",
        description: "Calendar scheduling and capacity planning.",
        icon: Calendar,
        topics: [
            {
                title: "Scheduling Appointments",
                steps: [
                    "Go to Appointments → 'New Appointment'",
                    "Select customer and vehicle",
                    "Choose date and time slot",
                    "Assign technician (system shows availability)",
                    "Select service type and estimated duration",
                    "Add special instructions or customer requests",
                    "Send confirmation email to customer",
                ],
                actionLink: "/appointments/new",
                actionLabel: "Book Appointment"
            },
            {
                title: "Converting to Work Order",
                steps: [
                    "Open scheduled appointment",
                    "When customer arrives, click 'Convert to Work Order'",
                    "Pre-filled work order opens with appointment details",
                    "Add any additional services discovered during inspection",
                    "Save work order to begin service",
                ],
            },
        ],
    },
    accounting: {
        id: "accounting",
        title: "Accounting",
        description: "Financials, reconciliation, and reporting.",
        icon: BarChart3,
        topics: [
            {
                title: "Unified Analytics Dashboard",
                steps: [
                    "Navigate to Accounting → Overview to view the consolidated dashboard",
                    "Monitor 'Pulse' metrics: Cash on Hand, Net Profit, Burn Rate, and Runway",
                    "Use the Interactive Chart to toggle between Profitability, Cash Flow, and Revenue trends",
                    "Check the 'Operational Grid' for smart alerts (e.g., Low Runway, Overdue AR) and top jobs",
                    "Use global filters to analyze data by specific Date Range or Branch",
                ],
                actionLink: "/accounting",
                actionLabel: "Go to Dashboard"
            },
            {
                title: "Bank Reconciliation",
                steps: [
                    "Go to Accounting → Banking → Reconciliation",
                    "Upload bank statements (CSV) or create manual statement records",
                    "Use the split-view interface to match Bank Lines with System Transactions",
                    "Use 'Create & Match' for missing items like bank fees or interest",
                    "Ensure 'Difference' is 0.00 to finalize and close the reconciliation period",
                ],
                actionLink: "/accounting/banking/reconciliation",
                actionLabel: "Start Reconciliation"
            },
            {
                title: "Managing Accruals",
                steps: [
                    "Navigate to Accounting → Accruals",
                    "Review 'Candidates' for auto-detected unbilled POs (Expense) or uninvoiced WOs (Revenue)",
                    "Select items to auto-generate Accrual Journal Entries",
                    "Use 'Active Accruals' to view and Reverse accruals in the subsequent period",
                    "Manually create accruals for estimated costs (e.g., utilities) as needed",
                ],
                actionLink: "/accounting/accruals",
                actionLabel: "Manage Accruals"
            },
            {
                title: "Budgeting & Controls",
                steps: [
                    "Go to Accounting → Budgets to create Annual or Quarterly budgets",
                    "Allocate budget limits to specific GL accounts",
                    "Track real-time performance using the 'Budget vs Actual' report",
                    "Monitor dashboard insights for budget overrun alerts",
                ],
                actionLink: "/accounting/budgets",
                actionLabel: "View Budgets"
            },
            {
                title: "Financial Reporting",
                steps: [
                    "Access standard reports: P&L, Balance Sheet, Cash Flow, Trial Balance, and Aging",
                    "Use 'Job Profitability' to analyze margins per work order or technician",
                    "Filter P&L by 'Branch' for multi-location performance analysis",
                    "Export professional PDF 'Board Packs' directly from the Dashboard",
                ],
                actionLink: "/accounting/reports/profit-loss",
                actionLabel: "View P&L"
            },
            {
                title: "Journal Entries",
                steps: [
                    "Go to Accounting → Journal Entries → 'New Entry' for manual GL adjustments",
                    "Ensure Debits equal Credits (system enforces balance)",
                    "Use 'Recurring Entries' for standard monthly adjustments (if configured)",
                    "System events (Invoices, Bills, Payments) create auto-locked Journal Entries",
                ],
                actionLink: "/accounting/journal-entries/new",
                actionLabel: "New Entry"
            },
        ],
    },
    admin: {
        id: "admin",
        title: "Administration",
        description: "User management and system configuration.",
        icon: Settings,
        topics: [
            {
                title: "User Management",
                steps: [
                    "Go to Administration → Users",
                    "Click 'New User' to create account",
                    "Enter user details and assign role (Admin, Manager, Technician, etc.)",
                    "Set specific permissions if custom access needed",
                    "Send invitation email with temporary password",
                    "User changes password on first login",
                ],
                actionLink: "/admin/users",
                actionLabel: "Manage Users"
            },
            {
                title: "System Configuration",
                steps: [
                    "Navigate to Administration → Settings",
                    "Configure business details: name, address, tax ID",
                    "Set tax rates and default payment terms",
                    "Customize invoice template and email notifications",
                    "Set up integrations: payment gateway, email provider",
                    "Configure backup schedule and retention policy",
                ],
                actionLink: "/admin/settings",
                actionLabel: "Go to Settings"
            },
        ],
    },
    fixedassets: {
        id: "fixedassets",
        title: "Fixed Assets",
        description: "Track equipment, tools, and asset depreciation.",
        icon: Package,
        topics: [
            {
                title: "Tracking Assets",
                steps: [
                    "Go to Fixed Assets to view list of all equipment and tools",
                    "Monitor 'Net Book Value' and 'Accumulated Depreciation' stats",
                    "Filter by status: Active, Inactive, Disposed, Sold, or Retired",
                    "Click on an asset to view full history including acquisition cost",
                ],
                actionLink: "/fixed-assets",
                actionLabel: "View Assets"
            },
            {
                title: "Asset Management",
                steps: [
                    "Click 'Add Asset' to register new equipment",
                    "Assign assets to specific branches for location tracking",
                    "View 'Valuation' report for current financial standing",
                ],
            }
        ]
    },
    diagnosis: {
        id: "diagnosis",
        title: "Diagnosis",
        description: "AI-powered diagnostics and troubleshooting.",
        icon: Search,
        topics: [
            {
                title: "Diagnosis Overview",
                steps: [
                    "View all active diagnosis sessions in the main list",
                    "Filter by status: In Progress, Completed, or On Hold",
                    "Sort by 'Fee High to Low' to prioritize high-value diagnostic jobs",
                ],
                actionLink: "/diagnosis",
                actionLabel: "Diagnosis List"
            },
            {
                title: "Workflow",
                steps: [
                    "Technicians start a diagnosis from a Work Order",
                    "Record customer complaints and vehicle symptoms",
                    "System tracks 'Diagnostic Fee' for billing",
                    "Mark status as 'Completed' when issue is identified",
                ],
            }
        ]
    },
    subscriptions: {
        id: "subscriptions",
        title: "Subscriptions",
        description: "Manage recurring service plans and memberships.",
        icon: CreditCard,
        topics: [
            {
                title: "Package Management",
                steps: [
                    "Go to 'Manage Packages' to define service tiers (e.g., Gold, Lite)",
                    "Set monthly pricing and duration (e.g., 12 months)",
                    "Configure limits for specific services (e.g., 5 Towing km, 1 Emergency Fuel)",
                    "Toggle packages as Active/Inactive",
                ],
                actionLink: "/subscriptions/packages",
                actionLabel: "Manage Packages"
            },
            {
                title: "Subscription Lifecycle",
                steps: [
                    "Create new subscriptions for customers, linking specific vehicles",
                    "Monitor 'Days Remaining' and 'Payment Status' (Paid/Pending)",
                    "Use 'Renew' button to extend active subscriptions",
                    "Check 'Refund Eligibility' for cancellations (calculated automatically based on usage)",
                    "Track usage history (e.g., how many 'Flat Tyre' services used)",
                ],
                actionLink: "/subscriptions",
                actionLabel: "View Subscriptions"
            }
        ]
    }
};
