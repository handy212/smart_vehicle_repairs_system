'use client';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { feedbackApi } from '@/lib/api/feedback';
import { branchesApi, Branch } from '@/lib/api/branches';
import { DataTable } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import {
    MessageSquare,
    ThumbsUp,
    AlertCircle,
    HelpCircle,
    QrCode,
    Copy,
    ExternalLink,
    Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { QRPrintDialog } from '@/components/feedback/QRPrintDialog';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Printer, Filter, Settings, Save } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export default function AdminFeedbackPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [copiedBranchId, setCopiedBranchId] = useState<number | null>(null);
    const [selectedPrintBranch, setSelectedPrintBranch] = useState<Branch | null>(null);
    const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [selectedFeedback, setSelectedFeedback] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const { data: feedbackData, isLoading: feedbackLoading } = useQuery({
        queryKey: ['feedback', activeTab, statusFilter],
        queryFn: () => feedbackApi.getFeedback({
            category: activeTab === 'all' ? undefined : activeTab,
            status: statusFilter === 'all' ? undefined : statusFilter
        }),
    });

    const { data: branchesData } = useQuery({
        queryKey: ['branches'],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const branches = branchesData ?? [];
    const feedback = Array.isArray(feedbackData) ? feedbackData : feedbackData?.results || [];

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'suggestion': return <HelpCircle className="h-4 w-4" />;
            case 'complaint': return <AlertCircle className="h-4 w-4 text-destructive" />;
            case 'compliment': return <ThumbsUp className="h-4 w-4 text-success" />;
            default: return <MessageSquare className="h-4 w-4" />;
        }
    };

    const copyToClipboard = (branchCode: string, branchId: number) => {
        const url = `${window.location.origin}/feedback?branch=${branchCode}`;
        navigator.clipboard.writeText(url);
        setCopiedBranchId(branchId);
        toast.success('Feedback link copied to clipboard');
        setTimeout(() => setCopiedBranchId(null), 2000);
    };

    const updateFeedbackMutation = useMutation({

        mutationFn: ({ id, data }: { id: number, data: any }) => feedbackApi.updateFeedback(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feedback'] });
            toast.success('Feedback updated successfully');
            setIsDetailOpen(false);
        },

        onError: (error: any) => {
            toast.error(error.response?.data?.detail || 'Failed to update feedback');
        }
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new': return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">New</Badge>;
            case 'in_progress': return <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">In Progress</Badge>;
            case 'resolved': return <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">Resolved</Badge>;
            case 'archived': return <Badge variant="outline" className="opacity-60">Archived</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const columns = [
        {
            accessorKey: 'category' as const,
            header: 'Category',

            cell: (item: any) => {
                const category = item.category;
                return (
                    <div className="flex items-center gap-2">
                        {getCategoryIcon(category)}
                        <span className="capitalize">{category}</span>
                    </div>
                );
            }
        },
        {
            accessorKey: 'message' as const,
            header: 'Message',

            cell: (item: any) => (
                <div className="max-w-[400px] truncate" title={item.message}>
                    {item.message}
                </div>
            )
        },
        {
            accessorKey: 'branch_name' as const,
            header: 'Branch',

            cell: (item: any) => item.branch_name || <span className="text-muted-foreground italic">General</span>
        },
        {
            accessorKey: 'created_at' as const,
            header: 'Received',

            cell: (item: any) => format(new Date(item.created_at), 'MMM d, yyyy HH:mm')
        },
        {
            accessorKey: 'is_anonymous' as const,
            header: 'Submitter',

            cell: (item: any) => {
                const isAnonymous = item.is_anonymous;
                if (isAnonymous) return <Badge variant="outline">Anonymous</Badge>;
                return (
                    <div className="flex flex-col text-xs">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground">{item.email || item.phone}</span>
                    </div>
                );
            }
        },
        {
            accessorKey: 'status' as const,
            header: 'Status',

            cell: (item: any) => getStatusBadge(item.status)
        }
    ];

    return (
        <div className="container mx-auto py-6 space-y-6">
            <PageHeader
                title="Customer Feedback"
            >

            </PageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-4">
                    <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="flex items-center justify-between mb-4">
                            <TabsList>
                                <TabsTrigger value="all">All Feedback</TabsTrigger>
                                <TabsTrigger value="suggestion">Suggestions</TabsTrigger>
                                <TabsTrigger value="complaint">Complaints</TabsTrigger>
                                <TabsTrigger value="compliment">Compliments</TabsTrigger>
                            </TabsList>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Filter Status:</span>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="h-9 w-32 text-xs">
                                        <SelectValue placeholder="All Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="new">New</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="resolved">Resolved</SelectItem>
                                        <SelectItem value="archived">Archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <TabsContent value={activeTab} className="mt-0">
                            <DataTable
                                columns={columns}
                                data={feedback}
                                isLoading={feedbackLoading}

                                onRowClick={(item: any) => {
                                    setSelectedFeedback(item);
                                    setIsDetailOpen(true);
                                }}
                            />
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <QrCode className="h-5 w-5" />
                                Generate Links
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/feedback`}
                                        className="text-xs"
                                    />
                                    <Button size="icon" variant="ghost" onClick={() => {
                                        navigator.clipboard.writeText(`${window.location.origin}/feedback`);
                                        toast.success('General link copied');
                                    }}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="pt-4 border-t space-y-3">
                                <p className="text-sm font-medium">Branch Specific Links</p>
                                {branches.map((branch: Branch) => (
                                    <div key={branch.id} className="flex flex-col gap-1 p-2 rounded-md border bg-muted/30">
                                        <span className="text-xs font-semibold">{branch.name}</span>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground uppercase">{branch.code}</span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2"
                                                    onClick={() => copyToClipboard(branch.code, branch.id)}
                                                >
                                                    {copiedBranchId === branch.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                                                    <a href={`/feedback?branch=${branch.code}`} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2"
                                                    onClick={() => {
                                                        setSelectedPrintBranch(branch);
                                                        setIsPrintDialogOpen(true);
                                                    }}
                                                >
                                                    <Printer className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </div>

            <QRPrintDialog
                branch={selectedPrintBranch}
                open={isPrintDialogOpen}
                onOpenChange={setIsPrintDialogOpen}
            />

            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-lg">
                    <DialogClose onOpenChange={setIsDetailOpen} />
                    <DialogHeader>
                        <div className="flex items-center justify-between pr-8">
                            <DialogTitle className="flex items-center gap-2">
                                {selectedFeedback && getCategoryIcon(selectedFeedback.category)}
                                <span className="capitalize">{selectedFeedback?.category} Detail</span>
                            </DialogTitle>
                            {selectedFeedback && getStatusBadge(selectedFeedback.status)}
                        </div>
                        <DialogDescription>
                            Received on {selectedFeedback && format(new Date(selectedFeedback.created_at), 'PPPP p')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message</p>
                            <div className="p-3 bg-muted/30 rounded-md border text-sm whitespace-pre-wrap">
                                {selectedFeedback?.message}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Branch</p>
                                <p className="text-sm font-medium">{selectedFeedback?.branch_name || 'General'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Submitter</p>
                                <p className="text-sm font-medium">
                                    {selectedFeedback?.is_anonymous ? 'Anonymous' : selectedFeedback?.name}
                                </p>
                                {!selectedFeedback?.is_anonymous && (
                                    <p className="text-xs text-muted-foreground">{selectedFeedback?.email || selectedFeedback?.phone}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Update Status</p>
                                <Select
                                    value={selectedFeedback?.status}
                                    onValueChange={(val) => setSelectedFeedback({ ...selectedFeedback, status: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="new">New</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="resolved">Resolved</SelectItem>
                                        <SelectItem value="archived">Archived</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal Notes</p>
                                <Textarea
                                    placeholder="Add internal notes about this feedback..."
                                    value={selectedFeedback?.internal_notes || ''}
                                    onChange={(e) => setSelectedFeedback({ ...selectedFeedback, internal_notes: e.target.value })}
                                    className="min-h-[100px]"
                                />
                                <p className="text-[10px] text-muted-foreground italic">These notes are only visible to staff.</p>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDetailOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => updateFeedbackMutation.mutate({
                                id: selectedFeedback.id,
                                data: {
                                    status: selectedFeedback.status,
                                    internal_notes: selectedFeedback.internal_notes
                                }
                            })}
                            disabled={updateFeedbackMutation.isPending}
                        >
                            {updateFeedbackMutation.isPending ? 'Saving...' : 'Save Changes'}
                            {!updateFeedbackMutation.isPending && <Save className="ml-2 h-4 w-4" />}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
