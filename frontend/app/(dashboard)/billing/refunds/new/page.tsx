"use client";

import { useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { refundApi } from "@/lib/api/till-refund";
import apiClient from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, DollarSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/hooks/useToast";

export default function CreateRefundPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const [formData, setFormData] = useState({
        payment_id: "",
        invoice_id: "",
        customer_id: "",
        amount: "",
        reason: "",
        refund_method: "cash",
        reference_number: "",
    });

    const [payments, setPayments] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [customers, setCustomers] = useState([]);

    // Fetch payments, invoices, customers for dropdowns
    useState(() => {
        // Use apiClient or centralized APIs to ensure auth headers are included
        const fetchData = async () => {
            try {
                // Using apiClient directly for now to match previous endpoints, but safely
                const [paymentsRes, invoicesRes, customersRes] = await Promise.all([
                    apiClient.get('/billing/payments/'),
                    apiClient.get('/billing/invoices/'),
                    apiClient.get('/customers/customers/')
                ]);
                setPayments(paymentsRes.data.results || []);
                setInvoices(invoicesRes.data.results || []);
                setCustomers(customersRes.data.results || []);
            } catch (error) {
                console.error("Failed to load form data", error);
                toast({
                    title: "Error",
                    description: "Failed to load required data",
                    variant: "destructive"
                });
            }
        };
        fetchData();
    });

    const createMutation = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: (data: any) => refundApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast({ title: "Success", description: "Refund created successfully" });
            router.push('/billing/refunds');
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (error: any) => {
        toast({
            title: "Error",
            description: error.response?.data?.error || "Failed to create refund",
            variant: "destructive",
        });
    },
    });

const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.payment_id || !formData.invoice_id || !formData.customer_id || !formData.amount || !formData.reason) {
        toast({
            title: "Error",
            description: "Please fill in all required fields",
            variant: "destructive",
        });
        return;
    }

    createMutation.mutate({
        original_payment: parseInt(formData.payment_id),
        invoice: parseInt(formData.invoice_id),
        customer: parseInt(formData.customer_id),
        amount: formData.amount,
        reason: formData.reason,
        refund_method: formData.refund_method,
        reference_number: formData.reference_number,
    });
};

return (
    <div className="p-8 space-y-6">
        <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Refunds
        </Button>

        <div>
            <h1 className="text-3xl font-bold">Create Refund</h1>
            <p className="text-muted-foreground mt-1">Request a refund for a payment</p>
        </div>

        <form onSubmit={handleSubmit}>
            <div className="max-w-2xl space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Refund Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="payment">Original Payment *</Label>
                                <select
                                    id="payment"
                                    value={formData.payment_id}
                                    onChange={(e) => setFormData({ ...formData, payment_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-card mt-1"
                                    required
                                >
                                    <option value="">Select payment...</option>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {payments.map((p: any) => (
                                        <option key={p.id} value={p.id}>
                                            {p.payment_number} - ${p.amount}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <Label htmlFor="invoice">Invoice *</Label>
                                <select
                                    id="invoice"
                                    value={formData.invoice_id}
                                    onChange={(e) => setFormData({ ...formData, invoice_id: e.target.value })}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-card mt-1"
                                    required
                                >
                                    <option value="">Select invoice...</option>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {invoices.map((inv: any) => (
                                        <option key={inv.id} value={inv.id}>
                                            {inv.invoice_number} - ${inv.total}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="customer">Customer *</Label>
                            <select
                                id="customer"
                                value={formData.customer_id}
                                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                                className="w-full px-3 py-2 border border-border rounded-md bg-card mt-1"
                                required
                            >
                                <option value="">Select customer...</option>
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {customers.map((c: any) => (
                                    <option key={c.id} value={c.id}>
                                        {c.user?.first_name} {c.user?.last_name} {c.company_name ? `(${c.company_name})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="amount">Refund Amount *</Label>
                                <div className="relative mt-1">
                                    <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                                    <Input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        className="pl-9"
                                        placeholder="0.00"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <Label htmlFor="method">Refund Method *</Label>
                                <select
                                    id="method"
                                    value={formData.refund_method}
                                    onChange={(e) => setFormData({ ...formData, refund_method: e.target.value })}
                                    className="w-full px-3 py-2 border border-border rounded-md bg-card mt-1"
                                >
                                    <option value="cash">Cash</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="pos">POS/Card</option>
                                    <option value="mobile_money">Mobile Money</option>
                                    <option value="original_method">Original Payment Method</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="reference">Reference Number (Optional)</Label>
                            <Input
                                id="reference"
                                value={formData.reference_number}
                                onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                                placeholder="Transaction ID, cheque number, etc."
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label htmlFor="reason">Reason *</Label>
                            <Textarea
                                id="reason"
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                placeholder="Explain why this refund is being requested..."
                                className="mt-1"
                                rows={4}
                                required
                            />
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                type="submit"
                                disabled={createMutation.isPending}
                                className="flex-1"
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create Refund'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.back()}
                                className="flex-1"
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </form>
    </div>
);
}
