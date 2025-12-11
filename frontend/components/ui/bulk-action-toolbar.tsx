"use client";

import { Button } from "./button";
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
      className={`bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between animate-in slide-in-from-top-2 duration-200 ${className}`}
    >
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 text-blue-700 hover:text-blue-900 hover:bg-blue-100"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {showBulkSend && onBulkSend && (
            <Button
              variant="outline"
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
              variant="outline"
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
              variant="outline"
              size="sm"
              onClick={onBulkDelete}
              className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete Selected
            </Button>
          )}
        </div>
      </div>
  );
}

