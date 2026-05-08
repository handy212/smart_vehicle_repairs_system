'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/lib/hooks/useToast';
import {
    Loader2, Send, Users, UserPlus, X,
    Search, TrendingUp, AlertCircle, DollarSign,
    Sparkles, Paperclip, Clock, Calendar, MoreVertical,
    CheckCircle2, History
} from 'lucide-react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import smsApi, { SMSRecipient, SMSHistoryItem, SMSTemplate } from '@/services/sms';
import { AIAssistDialog } from '@/components/sms/AIAssistDialog';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import api from '@/lib/api/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSearchParams } from 'next/navigation';
import { RecipientSelector } from '@/components/sms/RecipientSelector';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils/cn';
import { getApiErrorMessage } from '@/lib/api/errors';


interface Customer {
    id: number;
    user_id?: number;
    company_name: string;
    full_name: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
}

const customersApi = {
    getAll: async (params: { limit?: number; search?: string }) => {
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
    const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);

    // Queries
    const { data: templates } = useQuery({
        queryKey: ['sms-templates'],
        queryFn: () => smsApi.getTemplates(),
    });

    const { data: history, refetch: refetchHistory } = useQuery({
        queryKey: ['sms-history'],
        queryFn: () => smsApi.getHistory(),
    });

    const { data: stats } = useQuery({
        queryKey: ['sms-stats'],
        queryFn: () => smsApi.getStats(),
        refetchInterval: 30000,
    });

    const { data: balance } = useQuery({
        queryKey: ['sms-balance'],
        queryFn: () => smsApi.getBalance(),
        refetchInterval: 60000,
    });

    const { data: customersData } = useQuery({
        queryKey: ['customers'],
        queryFn: () => customersApi.getAll({ limit: 1000 }),
    });
    const customers = customersData?.results || [];


    useEffect(() => {
        const rId = searchParams.get('recipient_id');
        const rName = searchParams.get('recipient_name');
        const rPhone = searchParams.get('phone');

        if (rId && rName && rPhone) {
            setRecipients(prev => {
                if (prev.some(p => p.value === rId && p.type === 'user')) return prev;
                return [...prev, { type: 'user', value: rId, name: `${decodeURIComponent(rName)} (${rPhone})` }];
            });
        }
    }, [searchParams]);

    const handleAddRecipient = (recipient: { type: 'user' | 'phone'; value: string; name: string }) => {
        if (recipients.some(r => r.value === recipient.value && r.type === recipient.type)) {
            toast({ title: 'Already added', description: 'Recipient already in list.' });
            return;
        }
        setRecipients(prev => [...prev, recipient as SMSRecipient]);
    };

    const handleRemoveRecipient = (index: number) => {
        setRecipients(prev => prev.filter((_, i) => i !== index));
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
                const r = recipients[0];
                const payload = {
                    message,
                    ...(r.type === 'user' ? { recipient_id: parseInt(r.value) } : { phone: r.value }),
                    scheduled_for: scheduledFor || undefined
                };
                await smsApi.sendSingle(payload);
                toast({ title: scheduledFor ? 'Scheduled' : 'Sent', description: scheduledFor ? 'SMS scheduled successfully.' : 'SMS sent successfully.' });
            } else {
                const response = await smsApi.sendBulk({
                    message,
                    recipients: recipients.map(r => ({ type: r.type, value: r.value })),
                    scheduled_for: scheduledFor || undefined
                });
                const failed = response.failed || (response.total - response.successful);
                toast({
                    title: failed === 0 ? 'Success' : 'Partial Success',
                    description: response.message,
                    variant: failed === response.total ? 'destructive' : 'default'
                });
            }
            setMessage('');
            setRecipients([]);
            setScheduledFor('');
            refetchHistory();
        } catch (error: unknown) {
            toast({
                title: 'Error',
                description: getApiErrorMessage(error, 'Failed to send SMS.'),
                variant: 'destructive'
            });
        } finally {
            setIsSending(false);
        }
    };

    const getSMSInfo = () => {
        const length = message.length;
        if (length === 0) return { count: 0, chars: 0, cost: 0 };
        const singleSMSLimit = 160;
        const multiSMSLimit = 153;
        const count = length > singleSMSLimit ? Math.ceil(length / multiSMSLimit) : 1;
        const costPerSMS = 0.05;
        const cost = count * costPerSMS * recipients.length;
        return { count, chars: length, cost };
    };

    const smsInfo = getSMSInfo();

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
            const uid = (customer.user_id ?? customer.id).toString();
            if (recipients.some(r => r.value === uid && r.type === 'user')) return;
            const name = customer.company_name || `${customer.first_name} ${customer.last_name}`;
            setRecipients(prev => [...prev, { type: 'user', value: uid, name: `${name} (${customer.phone})` }]);
            addedCount++;
        });
        if (addedCount > 0) {
            toast({ title: 'Added', description: `${addedCount} customer(s) added.` });
        }
        setSelectedCustomerIds([]);
        setIsCustomerDialogOpen(false);
    };

    const filteredCustomers: Customer[] = customers.filter((c: Customer) => {
        if (!customerSearch) return true;
        const search = customerSearch.toLowerCase();
        return (
            c.first_name?.toLowerCase().includes(search) ||
            c.last_name?.toLowerCase().includes(search) ||
            c.company_name?.toLowerCase().includes(search) ||
            c.email?.toLowerCase().includes(search) ||
            c.phone?.toLowerCase().includes(search)
        );
    });
    const filteredCustomersWithPhone = filteredCustomers.filter((c) => c.phone);
    const allFilteredSelected =
        filteredCustomersWithPhone.length > 0 &&
        filteredCustomersWithPhone.every((c) => selectedCustomerIds.includes(c.id));

    const handleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedCustomerIds((prev) =>
                prev.filter((id) => !filteredCustomersWithPhone.some((c) => c.id === id))
            );
        } else {
            setSelectedCustomerIds((prev) => {
                const toAdd = filteredCustomersWithPhone
                    .map((c) => c.id)
                    .filter((id) => !prev.includes(id));
                return [...prev, ...toAdd];
            });
        }
    };

    return (
        <PermissionGuard permission="send_notifications">
            <div className="space-y-4">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-foreground">
                            SMS Console
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">Manage customer communications and messaging stats</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard
                        label="SENT TODAY"
                        value={stats?.sent_today || 0}
                        icon={<TrendingUp className="h-5 w-5 text-success" />}
                        iconBg="bg-green-100"
                    />
                    <StatCard
                        label="SCHEDULED"
                        value={stats?.scheduled || 0}
                        icon={<Clock className="h-5 w-5 text-primary" />}
                        iconBg="bg-blue-100"
                        variant="primary"
                    />
                    <StatCard
                        label="FAILED TODAY"
                        value={stats?.failed_today || 0}
                        icon={<AlertCircle className="h-5 w-5 text-destructive" />}
                        iconBg="bg-red-100"
                        variant="danger"
                    />
                    <StatCard
                        label="SMS BALANCE"
                        value={balance?.success ? balance.balance.toLocaleString() : 'N/A'}
                        icon={<DollarSign className="h-5 w-5 text-warning" />}
                        iconBg="bg-orange-100"
                        symbol={balance?.currency || ""}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {/* Left Column: Composer */}
                    <Card className="overflow-hidden border-border shadow-sm xl:col-span-2">
                        <div className="space-y-4 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <Send className="h-4 w-4 text-primary" />
                                    <span>Compose Message</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-primary hover:bg-primary/10"
                                    onClick={() => setIsAIDialogOpen(true)}
                                >
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    AI Assist
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                                    <span>Message Content</span>
                                    <span>{smsInfo.chars} / 160 ({smsInfo.count} Segment)</span>
                                </div>
                                <Textarea
                                    id="message"
                                    placeholder="Type your message here..."
                                    className="min-h-[120px] resize-none rounded-md border-muted bg-muted/20 text-sm focus:ring-primary/20"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    maxLength={612}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Use Template</Label>
                                    <Select value="" onValueChange={(val) => setMessage(val)}>
                                        <SelectTrigger className="h-9 rounded-md border-muted bg-muted/20">
                                            <SelectValue placeholder="Select a template..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {templates?.map((t: SMSTemplate) => (
                                                <SelectItem key={t.id} value={t.sms_body}>{t.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">Schedule (Optional)</Label>
                                    <div className="relative">
                                        <Input
                                            type="datetime-local"
                                            value={scheduledFor}
                                            onChange={(e) => setScheduledFor(e.target.value)}
                                            min={new Date().toISOString().slice(0, 16)}
                                            className="h-9 rounded-md border-muted bg-muted/20 pr-10"
                                        />
                                        <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-between gap-3 pt-1 sm:flex-row">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-muted-foreground hover:text-foreground h-10 px-0"
                                    disabled={isSending}
                                >
                                    <Paperclip className="h-4 w-4 mr-2" />
                                    Attach Image (MMS)
                                </Button>
                                <Button 
                                    onClick={handleSend} 
                                    disabled={isSending || recipients.length === 0 || !message} 
                                    className="h-9 w-full px-5 font-semibold sm:w-auto"
                                >
                                    {isSending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="mr-2 h-4 w-4" />
                                    )}
                                    {scheduledFor ? 'Schedule' : 'Send Message'} {recipients.length > 0 && `(${recipients.length})`}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Right Column: Recipients Sidebar */}
                    <Card className="border-border shadow-sm">
                        <div className="flex h-full flex-col space-y-4 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 font-semibold text-foreground">
                                    <Users className="h-4 w-4 text-primary" />
                                    <span>Recipients</span>
                                </div>
                                <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary border-none">
                                    {recipients.length}
                                </Badge>
                            </div>

                            <div className="relative group">
                                <RecipientSelector
                                    customers={customers}
                                    onSelect={handleAddRecipient}
                                    placeholder="Add customer..."
                                />
                            </div>

                            <ScrollArea className="min-h-[260px] flex-1 pr-2">
                                {recipients.length === 0 ? (
                                        <div className="flex h-full flex-col items-center justify-center space-y-2 py-10 text-center opacity-60">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted/50">
                                                <Users className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">No recipients added</p>
                                            <p className="text-xs text-muted-foreground mt-1 max-w-[180px] mx-auto">
                                                Search and select customers to start messaging.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {recipients.map((r, i) => (
                                            <div 
                                                key={i} 
                                                className="group flex items-center gap-3 rounded-md border border-transparent bg-muted/20 p-2 hover:border-muted/50 hover:bg-muted/40"
                                            >
                                                <Avatar className="h-9 w-9 rounded-lg border">
                                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold rounded-lg uppercase">
                                                        {r.name?.substring(0, 2) || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate">{r.type === 'phone' ? 'Direct Phone' : 'Customer Account'}</p>
                                                </div>
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive rounded-lg"
                                                    onClick={() => handleRemoveRecipient(i)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>

                            {recipients.length > 0 && (
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg text-xs font-semibold"
                                    onClick={() => setRecipients([])}
                                >
                                    Clear All Recipients
                                </Button>
                            )}

                            <div className="mt-auto pt-2">
                                <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="h-9 w-full border-dashed text-sm font-medium">
                                            <UserPlus className="mr-2 h-4 w-4" /> Select from Contacts
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="flex h-[80vh] max-w-3xl flex-col overflow-hidden p-0">
                                        <DialogHeader className="p-4 pb-2">
                                            <DialogTitle>Select Customers</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex items-center gap-3 px-4 pb-3">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                                                <Input
                                                    type="text"
                                                    placeholder="Search by name, email, or phone..."
                                                    value={customerSearch}
                                                    onChange={(e) => setCustomerSearch(e.target.value)}
                                                    className="h-9 rounded-md border-muted bg-muted/20 pl-10"
                                                />
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-9 shrink-0 whitespace-nowrap px-3"
                                                onClick={handleSelectAll}
                                                disabled={filteredCustomersWithPhone.length === 0}
                                            >
                                                {allFilteredSelected ? 'Deselect All' : `Select All (${filteredCustomersWithPhone.length})`}
                                            </Button>
                                        </div>
                                        <ScrollArea className="flex-1 px-4">
                                            <div className="space-y-2">
                                                {filteredCustomers.map((c: Customer) => (
                                                    <div 
                                                        key={c.id} 
                                                        className="flex cursor-pointer items-center justify-between rounded-md border border-transparent p-2.5 hover:border-muted-foreground/10 hover:bg-muted/30"
                                                        onClick={() => handleToggleCustomerSelection(c.id)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "w-5 h-5 rounded border-2 flex items-center justify-center transition-all",
                                                                selectedCustomerIds.includes(c.id) ? "bg-primary border-primary text-white" : "border-muted-foreground/30"
                                                            )}>
                                                                {selectedCustomerIds.includes(c.id) && <CheckCircle2 className="h-3 w-3" />}
                                                            </div>
                                                            <Avatar className="h-9 w-9 rounded-lg border">
                                                                <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold rounded-lg uppercase">
                                                                    {c.company_name ? c.company_name.substring(0, 2) : `${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}` || 'C'}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold truncate">{c.company_name || `${c.first_name} ${c.last_name}`}</p>
                                                                <p className="text-xs text-muted-foreground">{c.phone}</p>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={recipients.some(r => r.value === (c.user_id ?? c.id).toString() && r.type === 'user')}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const name = c.company_name || `${c.first_name} ${c.last_name}`;
                                                                handleAddRecipient({
                                                                    type: 'user',
                                                                    value: (c.user_id ?? c.id).toString(),
                                                                    name: `${name} (${c.phone})`
                                                                });
                                                            }}
                                                        >
                                                            Add
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                        <DialogFooter className="items-center justify-between border-t bg-muted/20 p-4">
                                            <div className="text-sm font-medium text-foreground">
                                                {selectedCustomerIds.length > 0 && `${selectedCustomerIds.length} selected`}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button onClick={() => { setIsCustomerDialogOpen(false); setSelectedCustomerIds([]); }} variant="ghost">Cancel</Button>
                                                {selectedCustomerIds.length > 0 && (
                                                    <Button onClick={handleAddSelectedCustomers} variant="default" className="px-5">
                                                        Add {selectedCustomerIds.length} Selected
                                                    </Button>
                                                )}
                                            </div>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </Card>
                </div>

                
                <Card className="overflow-hidden border-border shadow-sm">
                    <div className="flex items-center justify-between border-b border-muted bg-muted/10 p-4">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <History className="h-4 w-4 text-primary" />
                            <span>Recent History</span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/5 font-semibold text-xs h-8">
                            View Full Logs
                        </Button>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="bg-muted/30 border-b">
                                <tr>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Recipient</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Message</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Date & Time</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                                    <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-muted/50">
                                {history?.map((row: SMSHistoryItem) => (
                                    <tr key={row.id} className="hover:bg-muted/10 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-10 w-10 rounded-full border bg-white shadow-sm ring-2 ring-transparent group-hover:ring-primary/10 transition-all">
                                                    <AvatarFallback className="bg-muted/50 text-muted-foreground text-xs font-bold uppercase transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                                                        {row.recipient_initials || 'U'}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-semibold text-foreground truncate">{row.recipient_name}</span>
                                                    <span className="text-[11px] text-muted-foreground font-medium">{row.recipient_phone}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-muted-foreground line-clamp-1 max-w-[300px]" title={row.message}>
                                                {row.message}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-foreground">
                                                    {(() => {
                                                        const date = new Date(row.created_at);
                                                        const today = new Date();
                                                        if (date.toDateString() === today.toDateString()) return 'Today';
                                                        const yesterdayObj = new Date();
                                                        yesterdayObj.setDate(today.getDate() - 1);
                                                        if (date.toDateString() === yesterdayObj.toDateString()) return 'Yesterday';
                                                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                                    })()}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground font-medium">
                                                    {new Date(row.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StatusBadge status={row.status} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                                                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl shadow-lg border-muted">
                                                    <DropdownMenuItem className="text-xs cursor-pointer rounded-lg m-1">Resend Message</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-xs cursor-pointer rounded-lg m-1">View Details</DropdownMenuItem>
                                                    <DropdownMenuItem className="text-xs cursor-pointer rounded-lg m-1 text-destructive hover:text-destructive focus:text-destructive">Delete Log</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))}
                                {(!history || history.length === 0) && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-3 opacity-40">
                                                <History className="h-12 w-12 text-muted-foreground" />
                                                <p className="text-sm font-medium">No recent history found</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>

            <AIAssistDialog
                open={isAIDialogOpen}
                onOpenChange={setIsAIDialogOpen}
                currentDraft={message}
                mode="sms"
                onUseSuggestion={(text) => setMessage(text)}
            />
        </PermissionGuard>
    );
}


function StatCard({ label, value, icon, iconBg, symbol = "", variant = "default" }: { 
    label: string, 
    value: string | number, 
    icon: React.ReactNode, 
    iconBg: string,
    symbol?: string,
    variant?: "default" | "primary" | "danger"
}) {
    return (
        <Card className="overflow-hidden border-border shadow-sm">
            <CardContent className="p-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest mb-2">{label}</p>
                        <div className="flex items-baseline gap-1">
                            {symbol && <span className="text-sm font-semibold text-muted-foreground">{symbol}</span>}
                            <p className={cn(
                                "text-lg font-semibold tracking-tight",
                                variant === "primary" && "text-primary",
                                variant === "danger" && "text-destructive",
                                variant === "default" && "text-foreground"
                            )}>{value}</p>
                        </div>
                    </div>
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", iconBg)}>
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function StatusBadge({ status }: { status: string }) {
    const s = status.toLowerCase();
    let config = { 
        label: status.toUpperCase(), 
        dot: "bg-gray-400", 
        bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200" 
    };

    if (s === 'sent' || s === 'delivered') {
        config = { label: "SENT", dot: "bg-success/100", bg: "bg-success/10 shadow-sm text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200/50" };
    } else if (s === 'failed') {
        config = { label: "FAILED", dot: "bg-destructive/100", bg: "bg-destructive/10 shadow-sm text-destructive dark:bg-red-900/20 dark:text-red-400 border-destructive/20/50" };
    } else if (s === 'scheduled' || s === 'pending') {
        config = { label: "SCHEDULED", dot: "bg-info/100", bg: "bg-info/10 shadow-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-info/20/50" };
    }

    return (
        <Badge variant="outline" className={cn("rounded-full px-3 py-1 font-bold text-[10px] tracking-wide gap-1.5 border min-w-[100px] justify-center", config.bg)}>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", config.dot)} />
            {config.label}
        </Badge>
    );
}
