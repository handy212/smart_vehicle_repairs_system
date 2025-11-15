"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { workOrderNotesApi, WorkOrderNote } from "@/lib/api/workorder-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import AddNoteDialog from "./AddNoteDialog";

interface NotesTabProps {
  workOrderId: number;
  notes: WorkOrderNote[];
  onRefresh: () => void;
}

export default function WorkOrderNotesTab({ workOrderId, notes, onRefresh }: NotesTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const importantNotes = notes.filter((n) => n.is_important);
  const regularNotes = notes.filter((n) => !n.is_important);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Notes</CardTitle>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Note
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {notes.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No notes yet. Add a note to track important information.
            </p>
          ) : (
            <>
              {importantNotes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                    Important Notes
                  </h3>
                  <div className="space-y-3">
                    {importantNotes.map((note) => (
                      <div
                        key={note.id}
                        className="border-l-4 border-red-500 bg-red-50 p-4 rounded-r"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="danger">{note.note_type}</Badge>
                            {note.is_customer_visible && (
                              <Badge variant="secondary">Customer Visible</Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.note}</p>
                        {note.created_by_name && (
                          <p className="text-xs text-gray-500 mt-2">
                            By: {note.created_by_name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {regularNotes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    All Notes
                  </h3>
                  <div className="space-y-3">
                    {regularNotes.map((note) => (
                      <div key={note.id} className="border border-gray-200 bg-white p-4 rounded">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <Badge variant="default">{note.note_type}</Badge>
                            {note.is_customer_visible && (
                              <Badge variant="secondary">Customer Visible</Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {format(new Date(note.created_at), "MMM dd, yyyy 'at' h:mm a")}
                          </span>
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.note}</p>
                        {note.created_by_name && (
                          <p className="text-xs text-gray-500 mt-2">
                            By: {note.created_by_name}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showAddDialog && (
        <AddNoteDialog
          workOrderId={workOrderId}
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}

