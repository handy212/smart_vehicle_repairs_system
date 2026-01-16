'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/lib/hooks/useToast';
import { Loader2, Send, Users, UserPlus, X, Phone, Search, TrendingUp, AlertCircle, DollarSign } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import smsApi, { SMSRecipient } from '@/services/sms';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DataTable, Column } from '@/components/shared/DataTable';
import api from '@/lib/api/client';
import { Select } from '@/components/ui/select';
import { Calendar, Clock, History, FileText } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { TemplateManager } from '@/components/sms/TemplateManager';
import { RecipientSelector } from '@/components/sms/RecipientSelector';
import { useEffect } from 'react';

// Type for Customer Selection
interface Customer {
    id: number;
    company_name: string;
    full_name: string; // From API
    first_name: string; // Fallback
    last_name: string; // Fallback
    email: string;
    phone: string;
}

// Temporary Customers API definition
const customersApi = {
    getAll: async (params: any) => {
        const response = await api.get('/customers/customers/', { params });
        return response.data;
    }
};

export default function SMSConsolePage() {
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const [message, setMessage] = useState('');
    const [recipients, setRecipients] = useState<SMSRecipient[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
    const [scheduledFor, setScheduledFor] = useState('');

    // Fetch Templates
    const { data: templates } = useQuery({
        queryKey: ['sms-templates'],
        queryFn: () => smsApi.getTemplates(),
    });

    // Fetch History
    const { data: history, refetch: refetchHistory } = useQuery({
        queryKey: ['sms-history'],
        queryFn: () => smsApi.getHistory(),
    });

    // Fetch Stats
    const { data: stats } = useQuery({
        queryKey: ['sms-stats'],
        queryFn: () => smsApi.getStats(),
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    // Fetch Balance
    const { data: balance } = useQuery({
        queryKey: ['sms-balance'],
        queryFn: () => smsApi.getBalance(),
        refetchInterval: 60000, // Refresh every minute
    });

    // Fetch Customers for Selection
    const { data: customersData, isLoading: isLoadingCustomers } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersApi.getAll({ limit: 1000 }), // Get all for simplified selection
    });
    const customers = customersData?.results || [];

    // Handle URL Params for Recipients
    useEffect(() => {
        const rId = searchParams.get('recipient_id');
        const rName = searchParams.get('recipient_name');
        const rPhone = searchParams.get('phone');

        if (rId && rName && rPhone) {
            // Avoid adding duplicate if already exists (check by value/id)
            setRecipients(prev => {
                if (prev.some(p => p.value === rId && p.type === 'user')) return prev;
                return [...prev, { type: 'user', value: rId, name: `${decodeURIComponent(rName)} (${rPhone})` }];
            });
            // Clear params to avoid re-adding on soft refresh? (Optional, maybe not needed for MVP)
        }
    }, [searchParams]);

    // Handle Recipient Logic (Unified)
    const handleAddRecipient = (recipient: { type: 'user' | 'phone'; value: string; name: string }) => {
        // Check duplicate
        if (recipients.some(r => r.value === recipient.value && r.type === recipient.type)) {
            toast({ title: 'Already added', description: 'Recipient already in list.' });
            return;
        }
        setRecipients(prev => [...prev, recipient as SMSRecipient]);
    };

    const handleRemoveRecipient = (index: number) => {
        const newList = [...recipients];
        newList.splice(index, 1);
        setRecipients(newList);
    };

    const handleSend = async () => {
        if (!message) {
            toast({ title: 'Message required', description: 'Please enter a message to send.' });
            return;
        }
        if (recipients.length === 0) {
            toast({ title: 'Recipients required', description: 'Please add at least one recipient.' });
            return;
        }

        setIsSending(true);
        try {
            if (recipients.length === 1) {
                // Single Send Optimization
                const r = recipients[0];
                const payload = {
                    message,
                    ...(r.type === 'user' ? { recipient_id: parseInt(r.value) } : { phone: r.value }),
                    scheduled_for: scheduledFor || undefined
                };
                await smsApi.sendSingle(payload);
                toast({ title: scheduledFor ? 'Scheduled' : 'Sent', description: scheduledFor ? 'SMS scheduled successfully.' : 'SMS sent successfully.' });
            } else {
                // Bulk Send
                const response = await smsApi.sendBulk({
                    message,
                    recipients: recipients.map(r => ({ type: r.type, value: r.value })),
                    scheduled_for: scheduledFor || undefined
                });

                const failed = response.failed || (response.total - response.successful);
                const variant = failed === 0 ? 'default' : (failed === response.total ? 'destructive' : 'default');

                // Use backend message (Now includes failed count)
                let description = response.message;

                // Add first error detail if there are failures
                if (failed > 0 && response.results) {
                    const firstError = response.results.find((r: any) => !r.success)?.error;
                    if (firstError) {
                        description += `\nReason: ${firstError}`;
                    }
                }

                toast({
                    title: failed === 0 ? 'Success' : (failed === response.total ? 'All Failed' : 'Partial Success'),
                    description: description,
                    variant: variant
                });
            }

            // Clear form on success
            setMessage('');
            setRecipients([]);
            setScheduledFor('');
            refetchHistory(); // Refresh history
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.response?.data?.error || error.message || 'Failed to send SMS.',
                variant: 'destructive'
            });
        } finally {
            setIsSending(false);
        }
    };

    // Handler for bulk customer selection
    const handleToggleCustomerSelection = (customerId: number) => {
        setSelectedCustomerIds(prev =>
            prev.includes(customerId)
                ? prev.filter(id => id !== customerId)
                : [...prev, customerId]
        );
    };

    const handleAddSelectedCustomers = () => {
        const selected = customers.filter((c: Customer) => selectedCustomerIds.includes(c.id));
        let addedCount = 0;

        selected.forEach((customer: Customer) => {
            if (!customer.phone) return;
            if (recipients.some(r => r.value === customer.id.toString() && r.type === 'user')) return;

            const name = customer.company_name || `${customer.first_name} ${customer.last_name}`;
            setRecipients(prev => [...prev, { type: 'user', value: customer.id.toString(), name: `${name} (${customer.phone})` }]);
            addedCount++;
        });

        if (addedCount > 0) {
            toast({ title: 'Added', description: `${addedCount} customer(s) added to recipient list.` });
        }
        setSelectedCustomerIds([]);
        setIsCustomerDialogOpen(false);
    };

    const customerColumns: Column<Customer>[] = [
        {
            accessorKey: 'checkbox' as any,
            header: '',
            cell: (c) => (
                <div className="flex items-center justify-center">
                    <input
                        type="checkbox"
                        checked={selectedCustomerIds.includes(c.id)}
                        onChange={() => handleToggleCustomerSelection(c.id)}
                        className="h-4 w-4"
                    />
                </div>
            ),
        },
        {
            accessorKey: 'company_name',
            header: 'Name',
            cell: (c: any) => <span>{c.company_name || c.full_name || `${c.first_name || ''} ${c.last_name || ''}`}</span>
        },
        {
            accessorKey: 'phone', // Use accessor for phone
            header: 'Phone',
            cell: (c: any) => <span>{c.phone}</span>
        },
        {
            header: 'Actions',
            cell: (c: any) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        const name = c.company_name || c.full_name || `${c.first_name || ''} ${c.last_name || ''}`;
                        handleAddRecipient({
                            type: 'user',
                            value: c.id.toString(),
                            name: `${name} (${c.phone})`
                        });
                    }}
                    disabled={recipients.some(r => r.value === c.id.toString() && r.type === 'user')}
                >
                    Add
                </Button>
            )
        }
    ];

    const historyColumns: Column<any>[] = [
        {
            accessorKey: 'recipient',
            header: 'Recipient',
        },
        {
            accessorKey: 'message',
            header: 'Message',
            cell: (row) => <span className="truncate max-w-[200px] block" title={row.message}>{row.message}</span>
        },
        {
            accessorKey: 'created_at',
            header: 'Date',
            cell: (row) => new Date(row.created_at).toLocaleString()
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: (row) => (
                <Badge variant={
                    row.status === 'sent' || row.status === 'delivered' ? 'default' :
                        row.status === 'failed' ? 'danger' : 'secondary'
                }>
                    {row.status}
                </Badge>
            )
        }
    ];

    // Helper: Calculate SMS count and cost
    const getSMSInfo = () => {
        const length = message.length;
        if (length === 0) return { count: 0, chars: 0, cost: 0 };

        // SMS segmentation logic
        const singleSMSLimit = 160;
        const multiSMSLimit = 153;

        let count = 1;
        if (length > singleSMSLimit) {
            count = Math.ceil(length / multiSMSLimit);
        }

        // Estimated cost (adjust based on your pricing)
        const costPerSMS = 0.05; // Example: 5 pesewas per SMS
        const cost = count * costPerSMS * recipients.length;

        return { count, chars: length, cost };
    };

    const smsInfo = getSMSInfo();

    return (
        <PermissionGuard permission="send_notifications">
            <div className="space-y-4">
                {/* Compact Header */}
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">SMS Console</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Send SMS messages to customers</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Sent Today</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats?.sent_today || 0}</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-green-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Scheduled</p>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats?.scheduled || 0}</p>
                                </div>
                                <Clock className="h-8 w-8 text-blue-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Failed Today</p>
                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{stats?.failed_today || 0}</p>
                                </div>
                                <AlertCircle className="h-8 w-8 text-red-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Balance</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                                        {balance?.success ? `${balance.currency} ${balance.balance.toFixed(2)}` : 'N/A'}
                                    </p>
                                </div>
                                <DollarSign className="h-8 w-8 text-gray-500 opacity-20" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Composer */}
                    <Card className="md:col-span-2">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Compose Message</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <Label htmlFor="message" className="text-sm">Message</Label>
                                <Textarea
                                    id="message"
                                    placeholder="Type your message here..."
                                    className="h-28 mt-1.5 text-sm"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={612} // 4 SMS segments max
                                />
                                {/* Enhanced Character Counter */}
                                <div className="flex items-center justify-between mt-2 text-xs">
                                    <div className="flex items-center gap-3">
                                        <span className={`font-medium ${smsInfo.count === 1 ? 'text-green-600 dark:text-green-400' :
                                            smsInfo.count === 2 ? 'text-yellow-600 dark:text-yellow-400' :
                                                'text-orange-600 dark:text-orange-400'
                                            }`}>
                                            {smsInfo.chars} chars
                                        </span>
                                        <span className="text-gray-500">•</span>
                                        <span className="text-gray-600 dark:text-gray-400">
                                            {smsInfo.count} SMS {smsInfo.count > 1 ? 'segments' : 'segment'}
                                        </span>
                                        {recipients.length > 0 && (
                                            <>
                                                <span className="text-gray-500">•</span>
                                                <span className="text-gray-600 dark:text-gray-400">
                                                    Est. cost: GHS {smsInfo.cost.toFixed(2)}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                    <span className="text-gray-400">{612 - smsInfo.chars} left</span>
                                </div>
                            </div>

                            <div className="flex gap-3 items-end">
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <Label htmlFor="template" className="text-sm">Use Template</Label>
                                        <TemplateManager />
                                    </div>
                                    <Select
                                        className="w-full h-9 text-sm"
                                        onChange={(e) => setMessage(e.target.value)}
                                        value=""
                                    >
                                        <option value="" disabled>Select a template...</option>
                                        {(templates as any[])?.map((t: any) => (
                                            <option key={t.id} value={t.sms_body}>{t.name}</option>
                                        ))}
                                    </Select>
                                </div>
                                <div className="flex-1">
                                    <Label htmlFor="schedule" className="mb-1 block text-sm">Schedule (Optional)</Label>
                                    <Input
                                        type="datetime-local"
                                        id="schedule"
                                        value={scheduledFor}
                                        onChange={(e) => setScheduledFor(e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="pt-2 flex justify-end">
                                <Button onClick={handleSend} disabled={isSending || recipients.length === 0 || !message} size="sm" className="h-9">
                                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (scheduledFor ? <Clock className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />)}
                                    {scheduledFor ? 'Schedule' : 'Send'} Message ({recipients.length})
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right Column: Recipients */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Recipients</CardTitle>
                            <CardDescription className="text-xs">Add recipients manually or from customers.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {/* Unified Recipient Selector */}
                            <div className="space-y-1">
                                <RecipientSelector
                                    customers={customers}
                                    onSelect={handleAddRecipient}
                                    placeholder="Search Customer or Type Phone..."
                                />
                            </div>

                            <Separator className="my-2" />

                            {/* Add Customer Button (Legacy/Bulk) */}

                            {/* Add Customer Button */}
                            <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="w-full">
                                        <UserPlus className="mr-2 h-4 w-4" /> Select Customers
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                                    <DialogHeader>
                                        <DialogTitle>Select Customers</DialogTitle>
                                    </DialogHeader>
                                    <div className="px-6 pb-4">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                            <Input
                                                type="text"
                                                placeholder="Search customers by name, email, or phone..."
                                                value={customerSearch}
                                                onChange={(e) => setCustomerSearch(e.target.value)}
                                                className="pl-10"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-auto px-6">
                                        <DataTable
                                            columns={customerColumns}
                                            data={customers.filter((c: Customer) => {
                                                if (!customerSearch) return true;
                                                const search = customerSearch.toLowerCase();
                                                return (
                                                    c.first_name?.toLowerCase().includes(search) ||
                                                    c.last_name?.toLowerCase().includes(search) ||
                                                    c.company_name?.toLowerCase().includes(search) ||
                                                    c.email?.toLowerCase().includes(search) ||
                                                    c.phone?.toLowerCase().includes(search)
                                                );
                                            })}
                                        />
                                    </div>
                                    <DialogFooter className="flex justify-between items-center">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {selectedCustomerIds.length > 0 && `${selectedCustomerIds.length} selected`}
                                        </div>
                                        <div className="flex gap-2">
                                            {selectedCustomerIds.length > 0 && (
                                                <Button onClick={handleAddSelectedCustomers} variant="default">
                                                    Add Selected ({selectedCustomerIds.length})
                                                </Button>
                                            )}
                                            <Button onClick={() => { setIsCustomerDialogOpen(false); setSelectedCustomerIds([]); }} variant="outline">Close</Button>
                                        </div>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Separator />

                            {/* List */}
                            <div className="relative">
                                <div className="absolute top-0 right-0">
                                    <Badge variant="secondary">{recipients.length}</Badge>
                                </div>
                                <h4 className="text-sm font-medium mb-2">Recipients List</h4>
                                <ScrollArea className="h-[300px] border rounded-md p-2">
                                    {recipients.length === 0 ? (
                                        <div className="text-center text-muted-foreground text-sm py-8">
                                            No recipients added.
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {recipients.map((r, i) => (
                                                <div key={i} className="flex justify-between items-center bg-muted/50 p-2 rounded text-sm">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        {r.type === 'user' ? <Users className="h-3 w-3 text-blue-500 shrink-0" /> : <Phone className="h-3 w-3 text-green-500 shrink-0" />}
                                                        <span className="truncate" title={r.name}>{r.name}</span>
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleRemoveRecipient(i)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                                {recipients.length > 0 && (
                                    <Button variant="link" size="sm" className="w-full mt-1 text-red-500 h-auto p-0" onClick={() => setRecipients([])}>
                                        Clear All
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* History Section */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <History className="h-4 w-4" /> Recent History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <DataTable
                            columns={historyColumns}
                            data={history || []}
                        />
                    </CardContent>
                </Card>
            </div>
        </PermissionGuard>
    );
}
