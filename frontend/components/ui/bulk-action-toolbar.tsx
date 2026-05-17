"use client";

import { Button } from "./button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { X, Trash2, CheckCircle, Mail, FileText } from "lucide-react";

interface BulkActionToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkDelete?: () => void;
  onBulkStatusUpdate?: () => void;
  onBulkSend?: () => void;
  showStatusUpdate?: boolean;
  showBulkSend?: boolean;
  className?: string;
}

export function BulkActionToolbar({
  selectedCount,
  onClearSelection,
  onBulkDelete,
  onBulkStatusUpdate,
  onBulkSend,
  showStatusUpdate = false,
  showBulkSend = false,
  className = "",
}: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/5 p-4 animate-in slide-in-from-top-2 duration-200 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <span className="text-sm font-medium text-primary">
            {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 text-primary hover:bg-primary/10"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showBulkSend && onBulkSend && (
            <Button
             variant="secondary"
              size="sm"
              onClick={onBulkSend}
              className="h-8"
            >
              <Mail className="w-4 h-4 mr-1" />
              Send Selected
            </Button>
          )}
          {showStatusUpdate && onBulkStatusUpdate && (
            <Button
             variant="secondary"
              size="sm"
              onClick={onBulkStatusUpdate}
              className="h-8"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Update Status
            </Button>
          )}
          {onBulkDelete && (
            <Button
             variant="secondary"
              size="sm"
              onClick={onBulkDelete}
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Selected
            </Button>
          )}
        </div>
      </div>
  );
}
