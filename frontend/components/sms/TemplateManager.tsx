import { useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api/client';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Template {
    id: number;
    name: string;
    sms_body: string;
    template_type: string;
    channel: string;
}

export function TemplateManager() {
    const [isOpen, setIsOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [name, setName] = useState('');
    const [body, setBody] = useState('');
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: templates, isLoading } = useQuery({
        queryKey: ['sms-templates-manager'],
        queryFn: async () => {
            const response = await api.get('/notifications/templates/', { params: { channel: 'sms' } });
            return response.data; // List of templates
        },
        enabled: isOpen
    });

    const createMutation = useMutation({
        mutationFn: async (data: { name: string; sms_body: string; channel: string; template_type: string }) => {
            return api.post('/notifications/templates/', data);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sms-templates-manager'] });
            queryClient.invalidateQueries({ queryKey: ['sms-templates'] }); // Invalidate main page query too
            toast({ title: 'Template created', description: 'Template has been added successfully.' });
            resetForm();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => toast({ title: 'Error', description: err.response?.data?.message || 'Failed to create template', variant: 'destructive' })
    });

const updateMutation = useMutation({
    mutationFn: async (data: { id: number; name: string; sms_body: string }) => {
        return api.patch(`/notifications/templates/${data.id}/`, data);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['sms-templates-manager'] });
        queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
        toast({ title: 'Template updated', description: 'Template has been updated successfully.' });
        resetForm();
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => toast({ title: 'Error', description: err.response?.data?.message || 'Failed to update template', variant: 'destructive' })
    });

const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
        return api.delete(`/notifications/templates/${id}/`);
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['sms-templates-manager'] });
        queryClient.invalidateQueries({ queryKey: ['sms-templates'] });
        toast({ title: 'Template deleted', description: 'Template has been removed.' });
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => toast({ title: 'Error', description: err.response?.data?.message || 'Failed to delete template', variant: 'destructive' })
    });

const handleSubmit = () => {
    if (!name || !body) {
        toast({ title: 'Missing fields', description: 'Name and Body are required.', variant: 'destructive' });
        return;
    }

    if (editingTemplate) {
        updateMutation.mutate({ id: editingTemplate.id, name, sms_body: body });
    } else {
        createMutation.mutate({ name, sms_body: body, channel: 'sms', template_type: 'custom' });
    }
};

const handleEdit = (t: Template) => {
    setEditingTemplate(t);
    setName(t.name);
    setBody(t.sms_body);
};

const resetForm = () => {
    setEditingTemplate(null);
    setName('');
    setBody('');
};

return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
                Manage Templates
            </Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col gap-0 p-0">
            <DialogHeader className="p-6 pb-4 border-b">
                <DialogTitle>Message Templates</DialogTitle>
            </DialogHeader>

            <div className="flex flex-1 overflow-hidden">
                {/* Left: List */}
                <div className="w-1/3 border-r bg-muted/10 flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-card bg-background">
                        <span className="text-sm font-medium">Templates</span>
                        <Button size="sm" variant="ghost" onClick={resetForm} disabled={!editingTemplate}>
                            <Plus className="h-4 w-4" /> New
                        </Button>
                    </div>
                    <ScrollArea className="flex-1">
                        {isLoading ? (
                            <div className="p-4 flex justify-center"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>
                        ) : (
                            <div className="divide-y">
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {(templates as any[])?.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground text-sm">No templates found.</div>
                                )}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                {(templates as any[])?.map((t: any) => (
                                    <div
                                        key={t.id}
                                        className={`p-4 cursor-pointer hover:bg-muted/50 transition-colors ${editingTemplate?.id === t.id ? 'bg-muted' : ''}`}
                                        onClick={() => handleEdit(t)}
                                    >
                                        <div className="font-medium text-sm truncate">{t.name}</div>
                                        <div className="text-xs text-muted-foreground truncate mt-1">{t.sms_body}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                {/* Right: Form */}
                <div className="flex-1 p-6 flex flex-col bg-card bg-background">
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="t-name">Template Name</Label>
                            <Input
                                id="t-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Appointment Reminder"
                            />
                        </div>
                        <div>
                            <Label htmlFor="t-body">Message Body</Label>
                            <Textarea
                                id="t-body"
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                placeholder="Type message content..."
                                className="h-48 resize-none"
                            />
                            <div className="text-xs text-muted-foreground text-right mt-1">
                                {body.length} / 320 characters
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-6 flex justify-between">
                        {editingTemplate ? (
                            <Button
                                variant="destructive"
                                onClick={() => {
                                    if (confirm('Delete this template?')) deleteMutation.mutate(editingTemplate.id);
                                }}
                                disabled={deleteMutation.isPending}
                            >
                                {deleteMutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                Delete
                            </Button>
                        ) : <div />}

                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setIsOpen(false)}>Close</Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={!name || !body || createMutation.isPending || updateMutation.isPending}
                            >
                                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                                {editingTemplate ? 'Save Changes' : 'Create Template'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </DialogContent>
    </Dialog>
);
}
