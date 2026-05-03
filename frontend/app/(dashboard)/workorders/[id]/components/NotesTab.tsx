"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { WorkOrderNote } from "@/lib/api/workorder-notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MessageSquare } from "lucide-react";
import AddNoteDialog from "./AddNoteDialog";

interface NotesTabProps {
  workOrderId: number;
  notes: WorkOrderNote[];
  onRefresh: () => void;
}

const formatType = (value?: string) => (value || "internal").replace(/_/g, " ");

export default function WorkOrderNotesTab({ workOrderId, notes, onRefresh }: NotesTabProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [notes]
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <div>
            <CardTitle className="text-base">Notes</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {notes.length} note{notes.length === 1 ? "" : "s"} recorded
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Note
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-10 text-center">
              <MessageSquare className="h-9 w-9 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">No notes yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add notes for customer communications and internal updates.
              </p>
              <Button className="mt-4" size="sm" variant="secondary" onClick={() => setShowAddDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Note
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead className="w-[150px]">Type</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-[160px]">By</TableHead>
                    <TableHead className="w-[120px]">Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedNotes.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {format(new Date(note.created_at), "MMM d, yyyy")}
                        <div>{format(new Date(note.created_at), "h:mm a")}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={note.note_type === "customer" ? "info" : "secondary"} className="capitalize">
                          {formatType(note.note_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="whitespace-pre-wrap text-sm text-foreground">{note.note}</p>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {note.created_by_name || "System"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          {note.is_important && <Badge variant="danger">Important</Badge>}
                          {note.is_customer_visible && <Badge variant="outline">Customer</Badge>}
                          {!note.is_important && !note.is_customer_visible && (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
