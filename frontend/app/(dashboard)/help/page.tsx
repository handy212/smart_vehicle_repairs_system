"use client";

import { useState } from "react";
import { Search, Mail, Phone, BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

// Module help documentation organized by category
const helpContent = {
    workorders: {
        title: "Work Orders",
        topics: [
            {
                title: "Creating a Work Order",
                steps: [
                    "Navigate to Work Orders and click 'New Work Order'",
                    "Select or create a customer from the dropdown",
                    "Choose the vehicle (or add a new one if needed)",
                    "Add service items: search and select from the service catalog",
                    "Add parts: search inventory and specify quantities",
                    "Assign a technician and set priority level",
                    "Add internal notes or customer-facing notes",
                    "Click 'Create Work Order' to save",
                ],
            },
            {
                title: "Managing Work Order Status",
                steps: [
                    "Open the work order from the list",
                    "Use the status dropdown to change: Draft → In Progress → Completed → Invoiced",
                    "Each status change is logged with timestamp and user",
                    "Use Kanban view to drag-and-drop work orders between status columns",
                ],
            },
            {
                title: "Adding Labor and Parts",
                steps: [
                    "Open an existing work order",
                    "In the Services section, click 'Add Service'",
                    "Select service type, enter hours, and labor rate",
                    "For parts: click 'Add Part', search inventory, enter quantity",
                    "Parts are automatically deducted from inventory when work order is completed",
                    "Review totals in the summary section before saving",
                ],
            },
        ],
    },
    inventory: {
        title: "Inventory Management",
        topics: [
            {
                title: "Adding New Parts",
                steps: [
                    "Go to Inventory → Parts → 'New Part'",
                    "Enter part number, name, and description",
                    "Set category, supplier, and location in warehouse",
                    "Define cost price and selling price",
                    "Set reorder point and reorder quantity for automatic alerts",
                    "Upload part image if available",
                    "Click 'Save' to add to inventory",
                ],
            },
            {
                title: "Managing Stock Levels",
                steps: [
                    "View current stock on Parts list page with color-coded status",
                    "Click on a part to see detailed stock history",
                    "Use 'Adjust Stock' to manually add/remove quantities",
                    "Enter reason for adjustment (received shipment, damaged, etc.)",
                    "All adjustments are logged with date, user, and reason",
                ],
            },
            {
                title: "Creating Purchase Orders",
                steps: [
                    "Go to Inventory → Purchase Orders → 'New PO'",
                    "Select supplier from dropdown",
                    "Add parts: search and select, enter quantities and unit prices",
                    "Review total amount and add notes",
                    "Save as Draft or submit to supplier",
                    "When parts arrive, mark PO as 'Received' to update stock",
                ],
            },
        ],
    },
    billing: {
        title: "Billing & Invoices",
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
        title: "Customer Management",
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
        title: "Vehicle Management",
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
    appointments: {
        title: "Appointments",
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
        title: "Accounting",
        topics: [
            {
                title: "Creating Journal Entries",
                steps: [
                    "Go to Accounting → Journal Entries → 'New Entry'",
                    "Select entry date",
                    "Add debit line: select account and enter amount",
                    "Add credit line: select account and enter amount",
                    "Ensure debits = credits (system validates)",
                    "Add description explaining transaction",
                    "Post entry to update account balances",
                ],
            },
            {
                title: "Running Financial Reports",
                steps: [
                    "Navigate to Accounting → Reports",
                    "Choose report type: Trial Balance, Balance Sheet, Income Statement, or Aging",
                    "Select date range (current month, quarter, year, or custom)",
                    "Click 'Generate Report'",
                    "Review on screen or export to PDF/Excel",
                    "Use filters to drill down into specific accounts",
                ],
            },
        ],
    },
    admin: {
        title: "Administration",
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
            },
        ],
    },
};

export default function HelpPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("workorders");

    // Filter all content based on search
    const getFilteredContent = () => {
        if (!searchQuery) return helpContent;

        const filtered: typeof helpContent = {} as any;
        Object.entries(helpContent).forEach(([key, module]) => {
            const matchingTopics = module.topics.filter(
                (topic) =>
                    topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    topic.steps.some((step) => step.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    module.title.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (matchingTopics.length > 0) {
                filtered[key as keyof typeof helpContent] = {
                    ...module,
                    topics: matchingTopics,
                };
            }
        });
        return filtered;
    };

    const filteredContent = getFilteredContent();
    const hasResults = Object.keys(filteredContent).length > 0;

    return (
        <div className="container max-w-6xl mx-auto p-4 space-y-4">
            {/* Compact Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Help & Support</h1>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                    type="text"
                    placeholder="Search help topics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9"
                />
            </div>

            {/* Main Content */}
            {hasResults ? (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
                    <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto">
                        {Object.entries(filteredContent).map(([key, module]) => (
                            <TabsTrigger key={key} value={key} className="text-xs px-2 py-1.5">
                                {module.title}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {Object.entries(filteredContent).map(([key, module]) => (
                        <TabsContent key={key} value={key} className="space-y-3">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg">{module.title}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <Accordion type="single" collapsible>
                                        {module.topics.map((topic, idx) => (
                                            <AccordionItem key={idx} value={`topic-${idx}`}>
                                                <AccordionTrigger className="text-sm font-medium py-2">
                                                    {topic.title}
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                    <ol className="list-decimal list-inside space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                                                        {topic.steps.map((step, stepIdx) => (
                                                            <li key={stepIdx} className="leading-relaxed">
                                                                {step}
                                                            </li>
                                                        ))}
                                                    </ol>
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    ))}
                </Tabs>
            ) : (
                <Card>
                    <CardContent className="py-8 text-center text-gray-500">
                        <p>No help topics found for "{searchQuery}"</p>
                    </CardContent>
                </Card>
            )}

            {/* Compact Contact */}
            <Card className="bg-blue-50/50 dark:bg-blue-950/20">
                <CardContent className="py-3">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">Need more help?</span>
                        <div className="flex gap-3">
                            <a
                                href="mailto:support@smartrepairs.com"
                                className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <Mail className="w-4 h-4" />
                                Email Support
                            </a>
                            <a
                                href="tel:+1-800-REPAIRS"
                                className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                <Phone className="w-4 h-4" />
                                Call Us
                            </a>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
