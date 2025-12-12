"use client";

import React, { useState } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./dialog";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Label } from "./label";
import { Settings2, Eye, EyeOff } from "lucide-react";

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface ColumnVisibilityProps {
  columns: ColumnConfig[];
  visibleColumns: Set<string>;
  onVisibilityChange: (visibleColumns: Set<string>) => void;
  title?: string;
}

export function ColumnVisibility({
  columns,
  visibleColumns,
  onVisibilityChange,
  title = "Column Visibility",
}: ColumnVisibilityProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localVisibleColumns, setLocalVisibleColumns] = useState<Set<string>>(visibleColumns);

  const handleToggle = (key: string) => {
    const newVisible = new Set(localVisibleColumns);
    if (newVisible.has(key)) {
      newVisible.delete(key);
    } else {
      newVisible.add(key);
    }
    setLocalVisibleColumns(newVisible);
  };

  const handleApply = () => {
    onVisibilityChange(localVisibleColumns);
    setIsOpen(false);
  };

  const handleReset = () => {
    const defaultVisible = new Set(
      columns.filter((col) => col.defaultVisible !== false).map((col) => col.key)
    );
    setLocalVisibleColumns(defaultVisible);
  };

  const handleSelectAll = () => {
    setLocalVisibleColumns(new Set(columns.map((col) => col.key)));
  };

  const handleDeselectAll = () => {
    setLocalVisibleColumns(new Set());
  };

  const visibleCount = localVisibleColumns.size;
  const totalCount = columns.length;

  return (
    <>
      <Button
       variant="secondary"
        size="sm"
        onClick={() => {
          setLocalVisibleColumns(visibleColumns);
          setIsOpen(true);
        }}
        className="relative"
      >
        <Settings2 className="w-4 h-4 mr-2" />
        Columns
        {visibleCount < totalCount && (
          <span className="ml-2 text-xs text-gray-500">({visibleCount}/{totalCount})</span>
        )}
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <Label className="text-sm font-medium">Select columns to display</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="h-7 text-xs"
                    type="button"
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="h-7 text-xs"
                    type="button"
                  >
                    None
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {columns.map((column) => {
                  const isVisible = localVisibleColumns.has(column.key);
                  return (
                    <div
                      key={column.key}
                      className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox
                        id={`column-${column.key}`}
                        checked={isVisible}
                        onCheckedChange={() => handleToggle(column.key)}
                      />
                      <Label
                        htmlFor={`column-${column.key}`}
                        className="flex-1 cursor-pointer flex items-center gap-2"
                      >
                        {isVisible ? (
                          <Eye className="w-4 h-4 text-gray-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={isVisible ? "text-gray-900" : "text-gray-400"}>
                          {column.label}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <div className="flex justify-between w-full">
              <Buttonvariant="secondary" onClick={handleReset} type="button">
                Reset to Default
              </Button>
              <div className="flex gap-2">
                <Buttonvariant="secondary" onClick={() => setIsOpen(false)} type="button">
                  Cancel
                </Button>
                <Button onClick={handleApply} type="button">
                  Apply
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

