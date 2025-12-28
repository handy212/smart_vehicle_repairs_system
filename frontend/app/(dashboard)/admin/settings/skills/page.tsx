"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { skillsApi } from "@/lib/api/technicians";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Award, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Skill {
    id: number;
    name: string;
    description?: string;
    is_active: boolean;
}

export default function SkillsManagementPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        is_active: true,
    });

    const { data: skills, isLoading } = useQuery({
        queryKey: ["skills"],
        queryFn: () => skillsApi.list(),
    });

    const createMutation = useMutation({
        mutationFn: (data: Partial<Skill>) => skillsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skills"] });
            toast({
                title: "Success",
                description: "Skill created successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to create skill",
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Skill> }) =>
            skillsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skills"] });
            toast({
                title: "Success",
                description: "Skill updated successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to update skill",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => skillsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["skills"] });
            toast({
                title: "Success",
                description: "Skill deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to delete skill",
                variant: "destructive",
            });
        },
    });

    const handleOpenDialog = (skill?: Skill) => {
        if (skill) {
            setEditingSkill(skill);
            setFormData({
                name: skill.name,
                description: skill.description || "",
                is_active: skill.is_active,
            });
        } else {
            setEditingSkill(null);
            setFormData({
                name: "",
                description: "",
                is_active: true,
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingSkill(null);
        setFormData({
            name: "",
            description: "",
            is_active: true,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingSkill) {
            updateMutation.mutate({ id: editingSkill.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleDelete = (skill: Skill) => {
        if (confirm(`Are you sure you want to delete "${skill.name}"? This action cannot be undone.`)) {
            deleteMutation.mutate(skill.id);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-4 pt-4">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/admin" className="hover:text-blue-600 transition-colors">Admin</Link>
                        <span>/</span>
                        <Link href="/admin/settings" className="hover:text-blue-600 transition-colors">Settings</Link>
                        <span>/</span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium">Skills</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Skills & Certifications</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage technician skills and expertise areas</p>
                </div>
                <Button size="sm" onClick={() => handleOpenDialog()} className="h-8">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Skill
                </Button>
            </div>

            <Card className="mx-4">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Award className="h-5 w-5 text-blue-500" />
                        All Skills ({skills?.length || 0})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {skills && skills.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {skills.map((skill) => (
                                        <TableRow key={skill.id}>
                                            <TableCell className="font-medium">{skill.name}</TableCell>
                                            <TableCell className="max-w-md">
                                                <p className="text-sm text-muted-foreground truncate">
                                                    {skill.description || "No description"}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={skill.is_active ? "default" : "outline"}>
                                                    {skill.is_active ? (
                                                        <>
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Active
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Inactive
                                                        </>
                                                    )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleOpenDialog(skill)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(skill)}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/5 border-dashed">
                            <Award className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <h3 className="text-lg font-semibold mb-1 text-foreground">No Skills Yet</h3>
                            <p>Create your first skill to get started.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingSkill ? "Edit Skill" : "Add New Skill"}</DialogTitle>
                            <DialogDescription>
                                {editingSkill
                                    ? "Update the details of this skill."
                                    : "Add a new skill that technicians can have."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name *</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., Diesel Engine Repair"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Brief description of this skill..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label htmlFor="is_active">Active</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {editingSkill ? "Update" : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
