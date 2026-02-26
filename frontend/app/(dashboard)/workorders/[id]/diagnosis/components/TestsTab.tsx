"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosisApi, DiagnosticTest } from "@/lib/api/diagnosis";
import { format } from "date-fns";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/lib/hooks/useToast";
import {
    TestTube,
    Plus,
    Edit,
    Trash2,
    Search,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TestsTabProps {
    diagnosisId: number;
    onRefresh: () => void;
    isDisabled?: boolean;
}

export function TestsTab({
    diagnosisId,
    onRefresh,
    isDisabled = false,
}: TestsTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingTest, setEditingTest] = useState<DiagnosticTest | null>(null);

    const { data: tests = [], isLoading, error } = useQuery({
        queryKey: ["diagnosis-tests", diagnosisId],
        queryFn: () => diagnosisApi.tests.list({ diagnosis: diagnosisId }),
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<DiagnosticTest>) => diagnosisApi.tests.create(diagnosisId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
            onRefresh();
            setShowAddDialog(false);
            toast({ title: "Test added", variant: "default" });
        },

        onError: (error: any) => {
            toast({
                title: "Failed to add test",
                description: error.response?.data?.message || error.message,
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<DiagnosticTest> }) =>
            diagnosisApi.tests.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
            onRefresh();
            setEditingTest(null);
            toast({ title: "Test updated", variant: "default" });
        },

        onError: (error: any) => {
            toast({
                title: "Failed to update test",
                description: error.response?.data?.message || error.message,
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => diagnosisApi.tests.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["diagnosis-tests", diagnosisId] });
            onRefresh();
            toast({ title: "Test deleted", variant: "default" });
        },

        onError: (error: any) => {
            toast({
                title: "Failed to delete test",
                description: error.response?.data?.message || error.message,
                variant: "destructive",
            });
        },
    });

    return (
        <>
            <Card className="border-none shadow-sm bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b bg-muted/50">
                    <div className="space-y-1">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-foreground">Diagnostic Tests</CardTitle>
                        <CardDescription className="text-xs">Tests performed on the vehicle</CardDescription>
                    </div>
                    <Button onClick={() => setShowAddDialog(true)} size="sm" className="h-8" disabled={isDisabled}>
                        <Plus className="w-3.5 h-3.5 mr-2" />
                        Add Test
                    </Button>
                </CardHeader>
                <CardContent className="pt-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                    ) : error ? (
                        <p className="text-sm text-red-600 text-center py-8">
                            Failed to load tests. Please try again.
                        </p>
                    ) : tests.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <TestTube className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm">No tests recorded yet.</p>
                            <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm" className="mt-4" disabled={isDisabled}>
                                <Plus className="w-4 h-4 mr-2" />
                                Add First Test
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                            {tests.map((test: any) => (
                                <div
                                    key={test.id}
                                    className="group p-4 bg-card border border-border rounded-lg hover:shadow-md transition-all duration-200"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal text-muted-foreground">
                                                    {test.category_display || test.category}
                                                </Badge>
                                                {test.performed_at && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {format(new Date(test.performed_at), "MMM d, HH:mm")}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-semibold text-sm truncate text-foreground">{test.test_name}</p>
                                        </div>
                                        <div className="flex items-center gap-1 ml-2 shrink-0">
                                            <Badge
                                                variant={
                                                    test.status === "pass"
                                                        ? "default"
                                                        : test.status === "fail"
                                                            ? "danger"
                                                            : "secondary"
                                                }
                                                className={`text-xs capitalize ${test.status === 'pass' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' : ''}`}
                                            >
                                                {test.status_display || test.status}
                                            </Badge>
                                        </div>
                                    </div>

                                    <div className="space-y-2 mb-3">
                                        {test.test_procedure && (
                                            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                                <span className="font-medium text-foreground block mb-0.5">Procedure:</span>
                                                <p className="line-clamp-2">{test.test_procedure}</p>
                                            </div>
                                        )}
                                        {test.actual_result && (
                                            <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                                <span className="font-medium text-foreground block mb-0.5">Result:</span>
                                                <p className="line-clamp-2">{test.actual_result}</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border transition-opacity">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
                                                    onClick={() => setEditingTest(test)}
                                                    disabled={isDisabled}
                                                    aria-label="Edit diagnostic test"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Edit Test</p>
                                            </TooltipContent>
                                        </Tooltip>

                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                    onClick={() => {
                                                        if (confirm("Delete this test?")) {
                                                            deleteMutation.mutate(test.id);
                                                        }
                                                    }}
                                                    disabled={isDisabled}
                                                    aria-label="Delete diagnostic test"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Delete Test</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <TestDialog
                open={showAddDialog || editingTest !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowAddDialog(false);
                        setEditingTest(null);
                    }
                }}
                test={editingTest}
                onSave={(data) => {
                    if (editingTest) {
                        updateMutation.mutate({ id: editingTest.id, data });
                    } else {
                        createMutation.mutate(data);
                    }
                }}
                isLoading={createMutation.isPending || updateMutation.isPending}
            />
        </>
    );
}

function TestDialog({
    open,
    onOpenChange,
    test,
    onSave,
    isLoading,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    test: DiagnosticTest | null;
    onSave: (data: Partial<DiagnosticTest>) => void;
    isLoading: boolean;
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        test_name: test?.test_name || "",
        category: test?.category || "electrical",
        test_procedure: test?.test_procedure || "",
        expected_result: test?.expected_result || "",
        actual_result: test?.actual_result || "",
        measurements: test?.measurements || {},
        tools_used: test?.tools_used || "",
        status: test?.status || "pass",
    });
    const [templateSearchQuery, setTemplateSearchQuery] = useState("");
    // * eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const [templateResults, setTemplateResults] = useState<any[]>([]);
    const [isSearchingTemplates, setIsSearchingTemplates] = useState(false);

    React.useEffect(() => {
        if (test) {
            setFormData({
                test_name: test.test_name || "",
                category: getCategory(test.category),
                test_procedure: test.test_procedure || "",
                expected_result: test.expected_result || "",
                actual_result: test.actual_result || "",
                measurements: test.measurements || {},
                tools_used: test.tools_used || "",
                status: test.status || "pass",
            });
            setTemplateResults([]);
        } else {
            setFormData({
                test_name: "",
                category: "electrical",
                test_procedure: "",
                expected_result: "",
                actual_result: "",
                measurements: {},
                tools_used: "",
                status: "pass",
            });
            setTemplateResults([]);
        }
    }, [test]);

    // Helper to safely cast category

    const getCategory = (cat: any) => {
        const allowed = ["electrical", "mechanical", "performance", "fluid", "pressure", "temperature", "visual", "road_test", "other"];
        return allowed.includes(cat) ? cat : "other";
    };

    // Search templates when name or category changes
    React.useEffect(() => {
        if (open && !test && (formData.test_name.length >= 2 || templateSearchQuery.length >= 2)) {
            const searchTimer = setTimeout(async () => {
                setIsSearchingTemplates(true);
                try {
                    const query = templateSearchQuery || formData.test_name;
                    const results = await diagnosisApi.testProcedureLibrary.search(query, formData.category);
                    setTemplateResults(results.slice(0, 5)); // Show top 5 results
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (error) {
                    setTemplateResults([]);
                } finally {
                    setIsSearchingTemplates(false);
                }
            }, 500); // Debounce 500ms

            return () => clearTimeout(searchTimer);
        } else {
            setTemplateResults([]);
        }
    }, [formData.test_name, formData.category, templateSearchQuery, open, test]);


    const handleSelectTemplate = async (template: any) => {
        try {
            // Mark template as used
            await diagnosisApi.testProcedureLibrary.use(template.id);

            // Populate form with template data
            setFormData({
                test_name: template.name || formData.test_name,
                category: template.category || formData.category,
                test_procedure: template.test_procedure || "",
                expected_result: template.expected_result || "",
                actual_result: formData.actual_result || "",
                measurements: template.measurement_fields || {},
                tools_used: template.tools_needed || "",
                status: formData.status || "pass",
            });
            setTemplateResults([]);
            toast({
                title: "Template loaded",
                description: `Loaded procedure: ${template.name}`,
                variant: "default",
            });

        } catch (error: any) {
            toast({
                title: "Failed to load template",
                description: error.response?.data?.error || "Could not load template",
                variant: "destructive",
            });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            performed_at: test?.performed_at || new Date().toISOString(),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 bg-card border border-border shadow-xl sm:rounded-xl">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold text-foreground">
                        {test ? "Edit Diagnostic Test" : "Add Diagnostic Test"}
                    </DialogTitle>
                    <DialogDescription>
                        {test ? "Modify the test details and results." : "Record a new diagnostic test and its results."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">
                        {/* Template Selection */}
                        {!test && (
                            <div className="bg-primary/5 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800 rounded-lg p-4">
                                <Label className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2 block">
                                    Quick Start from Template
                                </Label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 text-orange-400 w-4 h-4" />
                                    <Input
                                        placeholder="Search test procedure library..."
                                        value={templateSearchQuery || formData.test_name}
                                        onChange={(e) => {
                                            setTemplateSearchQuery(e.target.value);
                                            if (!templateSearchQuery) {
                                                setFormData({ ...formData, test_name: e.target.value });
                                            }
                                        }}
                                        className="pl-9 border-orange-200 focus-visible:ring-primary bg-card"
                                    />
                                    {isSearchingTemplates && (
                                        <div className="absolute right-3 top-2.5">
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                        </div>
                                    )}
                                </div>
                                {templateResults.length > 0 && (
                                    <div className="mt-2 border border-border rounded-lg bg-card shadow-sm overflow-hidden z-10 relative">
                                        <div className="p-2 text-xs font-semibold text-muted-foreground bg-muted/50 border-b border-border">
                                            Recommended Templates
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">

                                            {templateResults.map((template: any) => (
                                                <button
                                                    key={template.id}
                                                    type="button"
                                                    onClick={() => handleSelectTemplate(template)}
                                                    className="w-full text-left p-3 hover:bg-primary/10 dark:hover:bg-orange-900/20 border-b border-gray-50 border-border last:border-b-0 transition-colors group"
                                                >
                                                    <div className="font-semibold text-sm text-foreground group-hover:text-primary dark:group-hover:text-orange-300">
                                                        {template.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                                        {template.description || template.test_procedure}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="test_name" className="text-sm font-medium">Test Name <span className="text-red-500">*</span></Label>
                                <Input
                                    id="test_name"
                                    value={formData.test_name}
                                    onChange={(e) => setFormData({ ...formData, test_name: e.target.value })}
                                    placeholder="e.g., Battery Voltage Test"
                                    required
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category" className="text-sm font-medium">Category <span className="text-red-500">*</span></Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(val) => {

                                        setFormData({ ...formData, category: val as any });
                                        setTemplateResults([]);
                                    }}
                                    required
                                >
                                    <SelectTrigger id="category" className="h-9 w-full">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="electrical">Electrical</SelectItem>
                                        <SelectItem value="mechanical">Mechanical</SelectItem>
                                        <SelectItem value="performance">Performance</SelectItem>
                                        <SelectItem value="fluid">Fluid</SelectItem>
                                        <SelectItem value="pressure">Pressure</SelectItem>
                                        <SelectItem value="temperature">Temperature</SelectItem>
                                        <SelectItem value="visual">Visual</SelectItem>
                                        <SelectItem value="road_test">Road Test</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="test_procedure" className="text-sm font-medium">Test Procedure</Label>
                            <Textarea
                                id="test_procedure"
                                value={formData.test_procedure}
                                onChange={(e) => setFormData({ ...formData, test_procedure: e.target.value })}
                                placeholder="Step-by-step procedure..."
                                rows={4}
                                className="resize-none min-h-[100px]"
                            />
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="expected_result" className="text-sm font-medium">Expected Result</Label>
                                <Textarea
                                    id="expected_result"
                                    value={formData.expected_result}
                                    onChange={(e) => setFormData({ ...formData, expected_result: e.target.value })}
                                    placeholder="What is the expected outcome?"
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="actual_result" className="text-sm font-medium">Actual Result</Label>
                                <Textarea
                                    id="actual_result"
                                    value={formData.actual_result}
                                    onChange={(e) => setFormData({ ...formData, actual_result: e.target.value })}
                                    placeholder="What was the actual outcome?"
                                    rows={2}
                                    className="resize-none"
                                />
                            </div>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="tools_used" className="text-sm font-medium">Tools Used</Label>
                                <Input
                                    id="tools_used"
                                    value={formData.tools_used}
                                    onChange={(e) => setFormData({ ...formData, tools_used: e.target.value })}
                                    placeholder="e.g., Multimeter, Scanner"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="status" className="text-sm font-medium">Status <span className="text-red-500">*</span></Label>
                                <Select
                                    value={formData.status}

                                    onValueChange={(val) => setFormData({ ...formData, status: val as any })}
                                    required
                                >
                                    <SelectTrigger id="status" className="h-9 w-full">
                                        <SelectValue placeholder="Select status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pass">Pass</SelectItem>
                                        <SelectItem value="fail">Fail</SelectItem>
                                        <SelectItem value="inconclusive">Inconclusive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/50 mt-auto">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90 text-white">
                            {isLoading ? "Saving..." : test ? "Update Test" : "Add Test"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
