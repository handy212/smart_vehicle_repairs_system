"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Loader2, Plus, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NotesViewProps {
    customerId: number;
}

export function NotesView({ customerId }: NotesViewProps) {
    const [newNote, setNewNote] = useState("");
    const [editingNote, setEditingNote] = useState<any>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: notes = [], isLoading } = useQuery({
        queryKey: ["customer-notes", customerId],
        queryFn: () => customersApi.notes.list(customerId),
    });

    const createMutation = useMutation({
        mutationFn: (noteContent: string) => customersApi.notes.create(customerId, {
            customer: customerId,
            content: noteContent,
            note_type: 'general',
            is_important: false
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
            setNewNote("");
            toast({ title: "Note added" });
        },
        onError: () => {
            toast({ title: "Failed to add note", variant: "destructive" });
        }
    });

    const updateMutation = useMutation({
        mutationFn: (data: { id: number, note: string, is_important: boolean }) =>
            customersApi.notes.update(customerId, data.id, {
                content: data.note,
                note_type: 'general',
                is_important: data.is_important
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
            setEditingNote(null);
            toast({ title: "Note updated" });
        },
        onError: () => {
            toast({ title: "Failed to update note", variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (noteId: number) => customersApi.notes.delete(customerId, noteId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["customer-notes", customerId] });
            toast({ title: "Note deleted" });
        },
        onError: () => {
            toast({ title: "Failed to delete note", variant: "destructive" });
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingNote) {
            updateMutation.mutate({
                id: editingNote.id,
                note: newNote,
                is_important: editingNote.is_important
            });
        } else {
            if (!newNote.trim()) return;
            createMutation.mutate(newNote);
        }
    };

    const startEdit = (note: any) => {
        setEditingNote(note);
        setNewNote(note.content || "");
    };

    const cancelEdit = () => {
        setEditingNote(null);
        setNewNote("");
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-gray-500">
                        {editingNote ? "Edit Note" : "Add New Note"}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Textarea
                            placeholder="Type your note here..."
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            className="resize-none"
                        />
                        <div className="flex justify-between items-center">
                            {editingNote && (
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="edit-important"
                                        checked={editingNote.is_important}
                                        onChange={(e) => setEditingNote({ ...editingNote, is_important: e.target.checked })}
                                        className="rounded border-gray-300"
                                    />
                                    <label htmlFor="edit-important" className="text-sm text-gray-600">Important</label>
                                </div>
                            )}
                            <div className="flex gap-2 ml-auto">
                                {editingNote && (
                                    <Button type="button" variant="ghost" onClick={cancelEdit}>
                                        Cancel
                                    </Button>
                                )}
                                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !newNote?.trim()}>
                                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    {editingNote ? "Update Note" : "Add Note"}
                                </Button>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                ) : notes.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No notes found.</p>
                    </div>
                ) : (
                    notes.map((note: any) => (
                        <Card key={note.id}>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm">{note.created_by_name || "User"}</span>
                                        <span className="text-xs text-gray-500">{format(new Date(note.created_at), "MMM dd, yyyy h:mm a")}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {note.is_important && <Badge variant="danger">Important</Badge>}
                                        <div className="flex gap-1 ml-2">
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-gray-500" onClick={() => startEdit(note)}>Edit</Button>
                                            <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500 hover:text-red-600" onClick={() => { if (confirm("Delete note?")) deleteMutation.mutate(note.id); }}>Delete</Button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</p>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
