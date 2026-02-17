
import {
    ClipboardList, Package, CreditCard, Users, Car, Calendar,
    BarChart3, Settings, Truck, Wrench, Search, LayoutDashboard, FileCheck,
    Bell, Ticket, FileBarChart, MessageSquare, ShieldAlert, UserCog
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
        description: "User management, security, and system configuration.",
        icon: Settings,
        topics: [
            {
                title: "User Management",
                steps: [
                    "Go to Administration → Users.",
                    "Click 'New User' to create account.",
                    "Enter user details and assign a Role (Admin, Manager, Technician, etc.).",
                    "Assign a default Branch to restrict their data view to a specific location if needed.",
                    "The system sends an invitation email; users set their password upon first login.",
                ],
                actionLink: "/admin/users",
                actionLabel: "Manage Users"
            },
            {
                title: "Roles & Permissions (RBAC)",
                steps: [
                    "Navigate to Administration → Roles.",
                    "Standard roles (Super Admin, Manager, Technician) are pre-configured.",
                    "Create 'Custom Roles' to define granular access to specific modules (e.g., 'Inventory Only').",
                    "Toggle specific permissions (View, Create, Edit, Delete) for each module.",
                ],
                actionLink: "/admin/roles",
                actionLabel: "Manage Roles"
            },
            {
                title: "Audit Logs",
                steps: [
                    "Go to Administration → Audit Log.",
                    "Track every action taken in the system, including who did it and when.",
                    "Filter by User, Action Type (Create, Update, Delete), or Date Range.",
                    "Use this for troubleshooting data changes or security reviews.",
                ],
                actionLink: "/admin/audit-log",
                actionLabel: "View Audit Log"
            },
            {
                title: "Backups & Recovery",
                steps: [
                    "Navigate to Administration → Backups.",
                    "The system performs automatic daily backups.",
                    "Manually trigger a backup before major configuration changes.",
                    "Download backup files to secure offline storage.",
                ],
                actionLink: "/admin/backups",
                actionLabel: "Manage Backups"
            },
            {
                title: "System Branding & Settings",
                steps: [
                    "Navigate to Administration → Settings.",
                    "Set Company Logo, Colors, and Website Name.",
                    "Configure Branch details and Currency settings.",
                    "Manage 'Categories' for Inventory, Vehicles, and Assets.",
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
    },
    servicesdue: {
        id: "servicesdue",
        title: "Services Due",
        description: "Track and manage upcoming maintenance services.",
        icon: Bell,
        topics: [
            {
                title: "Monitoring Due Services",
                steps: [
                    "Navigate to 'Services Due' from the sidebar.",
                    "View vehicles requiring immediate attention (Oil changes, Brake checks, etc.).",
                    "Filter by time horizon (Due Today, Next 7 Days, Overdue).",
                    "Filter by service type and customer priority.",
                ],
                actionLink: "/services-due",
                actionLabel: "View Services Due"
            },
            {
                title: "Customer Outreach",
                steps: [
                    "Select cars that are overdue for service.",
                    "Click 'Send Reminder' to trigger an automated SMS/Email.",
                    "Log follow-up calls in the customer notes profile.",
                ],
            }
        ]
    },
    gatepasses: {
        id: "gatepasses",
        title: "Gate Passes",
        description: "Control vehicle entry and exit from the facility.",
        icon: Ticket,
        topics: [
            {
                title: "Issuing a Gate Pass",
                steps: [
                    "Navigate to Gate Passes → 'Issue Pass'.",
                    "Select the Work Order or Vehicle being released.",
                    "Confirm that the balance is fully paid or an exception is authorized.",
                    "Enter the person authorized to pick up the vehicle.",
                    "Print the pass or send a digital version to the gate security.",
                ],
                actionLink: "/gatepass",
                actionLabel: "Manage Passes"
            },
            {
                title: "Security Verification",
                steps: [
                    "Security staff can search for a pass via the 'Verify' interface.",
                    "Scan the QR code or enter the pass ID.",
                    "Mark the vehicle as 'Exited' once it leaves the facility.",
                ],
            }
        ]
    },
    reports: {
        id: "reports",
        title: "Operational Reports",
        description: "Analyze shop performance, technician productivity, and sales.",
        icon: FileBarChart,
        topics: [
            {
                title: "Standard Reports",
                steps: [
                    "Visit the Reports module for high-level summaries.",
                    "Sales Report: Analyze revenue by branch, service type, or time period.",
                    "Technician Efficiency: Monitor productivity and billing performance.",
                    "Customer Retention: Track repeat visits and churn rates.",
                ],
                actionLink: "/reports",
                actionLabel: "View Reports"
            },
            {
                title: "Exporting Data",
                steps: [
                    "Use 'Export to Excel' for the raw data used in reports.",
                    "Generate PDF summaries for management meetings or board packs.",
                ],
            }
        ]
    },
    sms: {
        id: "sms",
        title: "SMS Console",
        description: "Direct customer communication and automated notifications.",
        icon: MessageSquare,
        topics: [
            {
                title: "Manual Messaging",
                steps: [
                    "Open the SMS Console to chat directly with a customer.",
                    "Search for a customer by name or phone number.",
                    "View thread history including automated alerts.",
                ],
                actionLink: "/sms",
                actionLabel: "Manage SMS"
            },
            {
                title: "Automated Triggers",
                steps: [
                    "Configure triggers in Administration → Settings → SMS Templates.",
                    "Automated messages are sent for: Appointment Reminders, Work Order Updates, and Payment Confirmations.",
                ],
            }
        ]
    },
    hr: {
        id: "hr",
        title: "Human Resources (HR)",
        description: "Complete staff management: employees, leave, attendance, payroll, recruitment, performance, training, and compliance.",
        icon: UserCog,
        topics: [
            {
                title: "Staff Management",
                steps: [
                    "Navigate to **HR → Staff** to view all employees.",
                    "Click **'Add Employee'** to create a new staff member — fill in personal details, role, branch, and salary.",
                    "The system automatically creates an Employee Profile and user login credentials.",
                    "Assign employees to a **Department** and **Position** for organisational structure.",
                    "Set a **Reporting To** manager to establish the org chart hierarchy.",
                    "Update employment status (Active, Probation, Suspended, Terminated) as needed.",
                    "Each profile stores banking details, emergency contacts, and government IDs.",
                ],
                actionLink: "/hr/staff",
                actionLabel: "Manage Staff"
            },
            {
                title: "Departments & Positions",
                steps: [
                    "Go to **HR → Departments** to create and manage organisational units.",
                    "Each department belongs to a **Branch** and can have a **Department Head**.",
                    "Create **Positions** under each department (e.g., Senior Mechanic under Workshop).",
                    "Set salary ranges (min/max) on positions for budgeting and recruitment.",
                    "The staff count per department updates automatically.",
                ],
                actionLink: "/hr/departments",
                actionLabel: "Manage Departments"
            },
            {
                title: "Leave Management",
                steps: [
                    "**Leave Types**: Go to **HR → Leave → Leave Types** to configure leave categories (Annual, Sick, Maternity, etc.).",
                    "Set days allowed per year, whether it's paid, and if carry-forward is permitted.",
                    "**Requesting Leave**: Employees go to **HR → Leave** and click **'New Request'**.",
                    "Select leave type, date range, and provide a reason. Days are auto-calculated.",
                    "**Approving Leave**: Managers see pending requests and can **Approve** or **Reject** with notes.",
                    "**Leave Balances**: Track each employee's used, remaining, and carried-forward days per year.",
                ],
                actionLink: "/hr/leave",
                actionLabel: "Manage Leave"
            },
            {
                title: "Attendance & Time Tracking",
                steps: [
                    "Navigate to **HR → Attendance** to view daily attendance records.",
                    "Employees can **Clock In / Clock Out** from the attendance page.",
                    "The system calculates **Total Hours**, **Overtime**, and marks status (Present, Late, Absent, Half Day).",
                    "**Attendance Policy**: Configure work start/end times, late threshold (in minutes), and overtime multiplier.",
                    "Use **'Today Summary'** to get a quick overview of who's present, absent, and late.",
                    "View **'My Attendance'** for a personal attendance history.",
                ],
                actionLink: "/hr/attendance",
                actionLabel: "View Attendance"
            },
            {
                title: "Payroll Processing",
                steps: [
                    "**Step 1 — Salary Components**: Go to **HR → Payroll → Components** to define allowances (Housing, Transport) and deductions (SSNIT, Provident Fund).",
                    "Assign components to individual employees with specific amounts.",
                    "**Step 2 — Tax Rules**: Click the **Calculator icon** on the Payroll page to configure progressive PAYE income tax brackets.",
                    "**Step 3 — Create Period**: Click **'New Payroll Period'**, set start/end dates for the month.",
                    "**Step 4 — Process**: Click **'Process'** on the period. The system auto-generates payslips by calculating: Base Salary + Allowances + Overtime − Deductions − Tax = Net Pay.",
                    "**Step 5 — Review**: Click into the period to review individual payslips, view breakdowns, and edit if needed.",
                    "**Step 6 — Approve & Pay**: Click **'Approve'**, then **'Mark as Paid'** with a payment reference.",
                    "Employees can view their own payslips at **HR → Payroll → My Payslips**.",
                ],
                actionLink: "/hr/payroll",
                actionLabel: "Manage Payroll"
            },
            {
                title: "Recruitment & Hiring",
                steps: [
                    "Go to **HR → Recruitment** to manage open positions and candidates.",
                    "Click **'New Job Opening'** — set title, department, position, salary range, and closing date.",
                    "**Publish** the opening to make it visible.",
                    "Add **Applicants** with their contact info, resume, and source (Website, Referral, LinkedIn).",
                    "Move applicants through stages: **Screening → Interview → Offer → Hired** or **Rejected**.",
                    "Schedule **Interviews** with date, interviewer, type (In-Person / Video), and location.",
                    "After interview, add **Feedback** and **Rating** to the interview record.",
                    "Click **'Hire'** on a successful applicant to convert them into a staff member.",
                ],
                actionLink: "/hr/recruitment",
                actionLabel: "View Recruitment"
            },
            {
                title: "Performance Reviews",
                steps: [
                    "Navigate to **HR → Performance** to manage employee evaluations.",
                    "Click **'New Review'** — select the employee, review period, and assign a reviewer.",
                    "Fill in: **Overall Rating** (1–5), **Strengths**, **Areas for Improvement**, and **Goals**.",
                    "Click **'Submit'** to finalise the review.",
                    "The employee can view the review and add **Staff Comments**.",
                    "Click **'Acknowledge'** once the employee has read and accepted the review.",
                    "Use reviews to track growth over time and identify training needs.",
                ],
                actionLink: "/hr/performance",
                actionLabel: "Manage Reviews"
            },
            {
                title: "Training Programs",
                steps: [
                    "Go to **HR → Training** to manage staff development programs.",
                    "Click **'New Program'** — set name, description, trainer, dates, and max participants.",
                    "Mark programs as **Mandatory** to flag required training for specific departments.",
                    "**Enrol** employees into programs from the program detail page.",
                    "Track enrolment status: **Enrolled → In Progress → Completed**.",
                    "Record **Scores** and upload **Certificates** upon completion.",
                ],
                actionLink: "/hr/training",
                actionLabel: "Manage Training"
            },
            {
                title: "Compliance Documents",
                steps: [
                    "Navigate to **HR → Compliance** to track employee documents and certifications.",
                    "Add documents with type (ID Card, Driver's License, Certification, Health Certificate).",
                    "Enter **Issue Date** and **Expiry Date** — the system auto-calculates days until expiry.",
                    "Documents expiring within 30 days are flagged as **'Expiring Soon'**.",
                    "Expired documents are highlighted in red for immediate attention.",
                    "Upload document files for digital record-keeping.",
                ],
                actionLink: "/hr/compliance",
                actionLabel: "View Compliance"
            },
            {
                title: "Recommended Workflow",
                steps: [
                    "**1. Setup**: Create Departments → Positions → Attendance Policy → Leave Types → Salary Components → Tax Rules.",
                    "**2. Onboard**: Add employees with full profiles, assign to departments and positions.",
                    "**3. Daily**: Employees clock in/out. Managers approve leave requests.",
                    "**4. Monthly**: Create Payroll Period → Process → Review Payslips → Approve → Mark Paid.",
                    "**5. Quarterly**: Conduct Performance Reviews. Enrol staff in Training Programs.",
                    "**6. Ongoing**: Monitor Compliance Documents for expiry. Post Job Openings as needed.",
                ],
            },
        ]
    },
};
