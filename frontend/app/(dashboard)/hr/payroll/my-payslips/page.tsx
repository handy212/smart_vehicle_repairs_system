"use client";

import { useQuery } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { hrApi, PaySlip } from "@/lib/api/hr";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Banknote, Download, FileText } from "lucide-react";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { cn } from "@/lib/utils/cn";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function MyPayslipsPage() {
    return (
        <>
            <DynamicPageTitle title="My Payslips" />
            <MyPayslipsContent />
        </>
    );
}

function MyPayslipsContent() {
    const { data: payslips, isLoading } = useQuery({
        queryKey: ["hr", "my-payslips"],
        queryFn: async () => (await hrApi.payslips.myPayslips()).data,
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case "draft": return "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400";
            case "approved": return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400";
            case "paid": return "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400";
            default: return "";
        }
    };

    const totalEarned = (payslips ?? []).reduce((s, p) => s + parseFloat(p.net_pay || "0"), 0);

    return (
        <div className="space-y-4">
            <StaffPageHeader
                title="My Payslips"
                breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "HR", href: "/hr" }, { label: "Payroll", href: "/hr/payroll" }, { label: "My Payslips" }]}
            />

            {!isLoading && payslips && (
                <div className="grid grid-cols-2 gap-3">
                    <Card className="shadow-sm border"><CardContent className="p-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payslips</span><span className="text-lg font-bold">{payslips.length}</span></CardContent></Card>
                    <Card className="shadow-sm border"><CardContent className="p-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Earned</span><span className="text-lg font-bold text-green-600">{totalEarned.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></CardContent></Card>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}</div>
            ) : payslips && payslips.length > 0 ? (
                <div className="space-y-3">
                    {payslips.map((slip) => (
                        <Card key={slip.id} className="shadow-sm border">
                            <Accordion type="single" collapsible>
                                <AccordionItem value={`slip-${slip.id}`} className="border-0">
                                    <AccordionTrigger className="px-4 py-3 hover:no-underline">
                                        <div className="flex items-center justify-between w-full pr-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                                                    <Banknote className="h-4.5 w-4.5 text-green-600" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-semibold">{slip.period_name}</p>
                                                    <p className="text-xs text-muted-foreground">{slip.payment_date ? `Paid on ${slip.payment_date}` : "Payment pending"}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 capitalize border shadow-none", getStatusColor(slip.status))}>{slip.status}</Badge>
                                                <span className="text-sm font-bold text-green-600">{parseFloat(slip.net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-4 pb-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                            // Earnings
                                            <Card className="border shadow-none">
                                                <CardHeader className="py-2 px-3 bg-green-50/50 dark:bg-green-900/10 border-b">
                                                    <CardTitle className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase">Earnings</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-3 space-y-2">
                                                    <div className="flex justify-between text-sm"><span>Basic Salary</span><span className="font-mono">{parseFloat(slip.basic_salary || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                    <div className="flex justify-between text-sm"><span>Overtime</span><span className="font-mono">{parseFloat(slip.overtime_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                    {Object.entries(slip.allowances || {}).map(([key, val]) => (
                                                        <div key={key} className="flex justify-between text-sm"><span className="capitalize">{key.replace(/_/g, " ")}</span><span className="font-mono">{parseFloat(val || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                    ))}
                                                    <div className="border-t pt-2 flex justify-between text-sm font-bold"><span>Gross Pay</span><span className="font-mono text-green-600">{parseFloat(slip.gross_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                </CardContent>
                                            </Card>

                                            // Deductions
                                            <Card className="border shadow-none">
                                                <CardHeader className="py-2 px-3 bg-red-50/50 dark:bg-red-900/10 border-b">
                                                    <CardTitle className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase">Deductions</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-3 space-y-2">
                                                    <div className="flex justify-between text-sm"><span>Tax</span><span className="font-mono">{parseFloat(slip.tax_amount || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                    {Object.entries(slip.deductions || {}).map(([key, val]) => (
                                                        <div key={key} className="flex justify-between text-sm"><span className="capitalize">{key.replace(/_/g, " ")}</span><span className="font-mono">{parseFloat(val || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                    ))}
                                                    <div className="border-t pt-2 flex justify-between text-sm font-bold"><span>Net Pay</span><span className="font-mono text-green-600">{parseFloat(slip.net_pay || "0").toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                        {slip.payment_reference && (
                                            <p className="text-xs text-muted-foreground mt-3">Ref: {slip.payment_reference}</p>
                                        )}
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card className="shadow-sm border">
                    <CardContent className="p-12 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No payslips available yet</p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
