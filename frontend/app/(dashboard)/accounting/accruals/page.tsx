"use client"

import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import {

    Check,

    X,
    RefreshCw,

    AlertCircle,

    Search,

    Filter,

    ArrowUpDown,
    ArrowRight
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,

    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/lib/hooks/useToast"
import { accountingApi } from "@/lib/api/accounting"
import { useCurrency } from "@/lib/hooks/useCurrency"

export default function AccrualsPage() {
    const { formatCurrency } = useCurrency()
    // * eslint-disable-next-line @typescript-eslint/no-unused-vars *
    const { toast, success, error } = useToast()
    const queryClient = useQueryClient()
    const [selectedTab, setSelectedTab] = useState("active")
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [selectedCandidate, setSelectedCandidate] = useState<any>(null)

    // -- Data Fetching --

    const { data: accruals, isLoading: isLoadingAccruals } = useQuery({
        queryKey: ["accruals", selectedTab],
        queryFn: () => accountingApi.getAccruals({ status: selectedTab === 'history' ? 'reversed' : 'active' }),
    })

    const { data: candidates, isLoading: isLoadingCandidates, refetch: refetchCandidates } = useQuery({
        queryKey: ["accrual-candidates"],
        queryFn: () => accountingApi.getAccrualCandidates(),
    })

    // -- Mutations --
    const createAccrualMutation = useMutation({

        mutationFn: (data: any) => accountingApi.createAccrual(data),
        onSuccess: () => {
            success("Accrual created successfully")
            setCreateDialogOpen(false)
            setSelectedCandidate(null)
            queryClient.invalidateQueries({ queryKey: ["accruals"] })
            queryClient.invalidateQueries({ queryKey: ["accrual-candidates"] })
        },

        onError: (err: any) => {
            error("Failed to create accrual", err.response?.data?.error || err.message)
        }
    })

    const reverseAccrualMutation = useMutation({
        mutationFn: (id: number) => accountingApi.reverseAccrual(id),
        onSuccess: () => {
            success("Accrual reversed successfully")
            queryClient.invalidateQueries({ queryKey: ["accruals"] })
        },

        onError: (err: any) => {
            error("Failed to reverse accrual", err.response?.data?.error || err.message)
        }
    })

    // -- Handlers --

    const handleCreateFromCandidate = (candidate: any) => {
        setSelectedCandidate(candidate)
        setCreateDialogOpen(true)
    }

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Accruals Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage period-end accruals for unbilled revenue and expenses.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refetchCandidates()}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Scan Candidates
                    </Button>
                    <Button onClick={() => { setSelectedCandidate(null); setCreateDialogOpen(true); }}>
                        + Manual Accrual
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="active" onValueChange={setSelectedTab}>
                <TabsList>
                    <TabsTrigger value="active">Active Accruals</TabsTrigger>
                    <TabsTrigger value="candidates">Candidates ({candidates?.length || 0})</TabsTrigger>
                    <TabsTrigger value="history">History (Reversed)</TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Reversal Date</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!accruals || accruals.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                                                No active accruals found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (

                                        accruals.map((accrual: any) => (
                                            <TableRow key={accrual.id}>
                                                <TableCell>{format(new Date(accrual.accrual_date), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={accrual.accrual_type === 'revenue' ? "success" : "default"}>
                                                        {accrual.accrual_type}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{accrual.description}</TableCell>
                                                <TableCell>{accrual.account_code} - {accrual.account_name}</TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(accrual.amount)}
                                                </TableCell>
                                                <TableCell>
                                                    {accrual.reversal_date ? format(new Date(accrual.reversal_date), 'MMM d, yyyy') : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            if (confirm('Are you sure you want to reverse this accrual?')) {
                                                                reverseAccrualMutation.mutate(accrual.id)
                                                            }
                                                        }}
                                                    >
                                                        Reverse
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="candidates" className="mt-4">


                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Est. Amount</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingCandidates ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24">Loading candidates...</TableCell>
                                        </TableRow>
                                    ) : !candidates || candidates.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                                No candidates found. All POs and WOs appear to be billed/invoiced.
                                            </TableCell>
                                        </TableRow>
                                    ) : (

                                        candidates.map((item: any, idx: number) => (
                                            <TableRow key={idx}>
                                                <TableCell>{format(new Date(item.date), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={item.type === 'revenue' ? "success" : "danger"}>
                                                        {item.type === 'revenue' ? 'Revenue' : 'Expense'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {item.source_model} #{item.source_reference}
                                                </TableCell>
                                                <TableCell>{item.description}</TableCell>
                                                <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" onClick={() => handleCreateFromCandidate(item)}>
                                                        Create Accrual
                                                        <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reversed Accruals</CardTitle>
                            <CardDescription>History of previous period accruals that have been reversed.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!accruals || accruals.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                                No history found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (

                                        accruals.map((accrual: any) => (
                                            <TableRow key={accrual.id}>
                                                <TableCell>{format(new Date(accrual.accrual_date), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{accrual.accrual_type}</Badge>
                                                </TableCell>
                                                <TableCell>{accrual.description}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(accrual.amount)}</TableCell>
                                                <TableCell><Badge variant="secondary">Reversed</Badge></TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <CreateAccrualDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                candidate={selectedCandidate}

                onSubmit={(data: any) => createAccrualMutation.mutate(data)}
            />
        </div>
    )
}


function CreateAccrualDialog({ open, onOpenChange, candidate, onSubmit }: any) {
    const { toast } = useToast();
    const { data: accounts } = useQuery({
        queryKey: ["accounts"],
        queryFn: accountingApi.getAccounts
    });

    // Determine default account type based on Candidate
    const isRevenue = candidate?.type === 'revenue';
    const accountFilter = isRevenue ? 'income' : 'expense';


    const filteredAccounts = accounts?.filter((a: any) => a.account_type === accountFilter) || [];

    const [accrualType, setAccrualType] = useState<string>('expense')
    const [accountId, setAccountId] = useState<string>('')

    // Sync state when dialog opens or candidate changes
    useEffect(() => {
        if (open) {
            setAccrualType(candidate?.type || 'expense')
            setAccountId('')
        }
    }, [open, candidate])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const data = {
            accrual_type: accrualType,
            account: accountId,
            amount: formData.get('amount'),
            accrual_date: formData.get('accrual_date'),
            reversal_date: formData.get('reversal_date'),
            description: formData.get('description'),
        }

        if (!data.account) {
            toast({ title: "Account Required", description: "Please select an account", variant: "destructive" });
            return;
        }

        onSubmit(data);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{candidate ? 'Create Accrual from Candidate' : 'Create Manual Accrual'}</DialogTitle>
                    <DialogDescription>
                        Create an accrual journal entry. It will be auto-posted.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Accrual Type</Label>
                            <Select
                                value={accrualType}
                                onValueChange={setAccrualType}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="expense">Accrued Expense</SelectItem>
                                    <SelectItem value="revenue">Accrued Revenue</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Amount</Label>
                            <Input name="amount" type="number" step="0.01" defaultValue={candidate?.amount || ''} required />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>P&L Account</Label>
                        <Select
                            value={accountId}
                            onValueChange={setAccountId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredAccounts.map((acc: any) => (
                                    <SelectItem key={acc.id} value={String(acc.id)}>
                                        {acc.code} - {acc.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Select the actual expense or revenue account.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input name="description" defaultValue={candidate?.description || ''} required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Accrual Date</Label>
                            <Input name="accrual_date" type="date" defaultValue={candidate?.date ? new Date(candidate.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Reversal Date (Optional)</Label>
                            <Input name="reversal_date" type="date" />
                            <p className="text-[10px] text-muted-foreground">Usually 1st of next month</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit">Create Accrual</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
