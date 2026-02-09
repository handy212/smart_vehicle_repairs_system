"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, Trash2, Edit2, Loader2, AlertTriangle, Info, Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface DamageMark {
  id: string;
  x: number; // Percentage position (0-100)
  y: number; // Percentage position (0-100)
  type: "scratch" | "dent" | "chip" | "crack" | "rust" | "other";
  description?: string;
  severity: "minor" | "moderate" | "major";
}

interface VehicleDamageMarkerProps {
  damage: DamageMark[];
  onChange: (damage: DamageMark[]) => void;
  disabled?: boolean;
}

const damageTypeColors: Record<DamageMark["type"], string> = {
  scratch: "bg-primary",
  dent: "bg-red-600",
  chip: "bg-yellow-500",
  crack: "bg-orange-600",
  rust: "bg-amber-800",
  other: "bg-gray-600",
};

const severityColors: Record<DamageMark["severity"], string> = {
  minor: "border-2 border-green-500 shadow-green-500/50",
  moderate: "border-2 border-yellow-500 shadow-yellow-500/50",
  major: "border-3 border-red-600 shadow-red-600/50",
};

const severitySizes: Record<DamageMark["severity"], string> = {
  minor: "w-6 h-6",
  moderate: "w-8 h-8",
  major: "w-10 h-10",
};

export function VehicleDamageMarker({ damage, onChange, disabled }: VehicleDamageMarkerProps) {
  const [editingMark, setEditingMark] = useState<DamageMark | null>(null);
  const [tempMark, setTempMark] = useState<{ x: number; y: number } | null>(null);
  const [newMarkData, setNewMarkData] = useState<Partial<DamageMark>>({ type: "scratch", severity: "minor", description: "" });
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setTempMark({ x, y });
    setNewMarkData({ type: "scratch", severity: "minor", description: "" });
  };

  const handleSaveMark = (markData: Partial<DamageMark>) => {
    if (!tempMark && !editingMark) return;

    if (editingMark && !tempMark) {
      // Update existing mark
      const updated = damage.map((m) =>
        m.id === editingMark.id ? { ...editingMark, ...markData } : m
      );
      onChange(updated);
      setEditingMark(null);
    } else if (tempMark) {
      // Create new mark
      const finalData = editingMark ? { ...editingMark, ...markData } : markData;
      const newMark: DamageMark = {
        id: `damage-${Date.now()}-${Math.random()}`,
        x: tempMark.x,
        y: tempMark.y,
        type: finalData.type || "scratch",
        description: finalData.description || "",
        severity: finalData.severity || "minor",
      };
      onChange([...damage, newMark]);
      setTempMark(null);
      setEditingMark(null);
      setNewMarkData({ type: "scratch", severity: "minor", description: "" });
    }
  };

  const handleDeleteMark = (id: string) => {
    onChange(damage.filter((m) => m.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicle Damage Assessment</CardTitle>
        <CardDescription>
          Click on the vehicle diagram to mark damage locations. Each mark is numbered and color-coded by type and severity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Breakdown - More Compact */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <div className="bg-muted/30 border rounded-md p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Total</span>
            <span className="text-lg font-black text-foreground">{damage.length}</span>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-md p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Major</span>
            <span className="text-lg font-black text-red-700 dark:text-red-300">{damage.filter(m => m.severity === "major").length}</span>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800/30 rounded-md p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">Moderate</span>
            <span className="text-lg font-black text-yellow-700 dark:text-yellow-300">{damage.filter(m => m.severity === "moderate").length}</span>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30 rounded-md p-2 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] font-bold uppercase tracking-widest text-green-600 dark:text-green-400">Minor</span>
            <span className="text-lg font-black text-green-700 dark:text-green-300">{damage.filter(m => m.severity === "minor").length}</span>
          </div>
        </div>

        {/* Legend - Even More Compact */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-1.5 px-3 bg-muted/30 rounded-full border text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-primary"></div><span>Scratch</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-red-600"></div><span>Dent</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div><span>Chip</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-orange-600"></div><span>Crack</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-amber-800"></div><span>Rust</span></div>
          <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-gray-600"></div><span>Other</span></div>
        </div>

        {/* Vehicle Diagram */}
        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="relative w-full h-[400px] border-2 border-border rounded-lg bg-card cursor-crosshair overflow-hidden"
          style={{ position: "relative" }}
        >
          {/* Loading Skeleton */}
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Loading vehicle diagram...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-center p-8">
              <div>
                <p className="font-semibold mb-2">Image not found</p>
                <p className="text-sm">Please ensure the vehicle diagram image is available at /images/car_with_markers.png</p>
              </div>
            </div>
          )}

          {/* Vehicle Image */}
          <img
            src="/images/car_with_markers.png"
            alt="Vehicle diagram for damage marking"
            className={`w-full h-full object-contain select-none transition-opacity duration-300 ${imageLoading ? "opacity-0" : "opacity-100"
              }`}
            draggable={false}
            loading="eager"
            fetchPriority="high"
            onLoad={() => setImageLoading(false)}
            onError={(e) => {
              setImageLoading(false);
              setImageError(true);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />

          {/* Damage Marks */}
          <TooltipProvider>
            {damage.map((mark, index) => (
              <div
                key={mark.id}
                className="absolute group"
                style={{
                  left: `${mark.x}%`,
                  top: `${mark.y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10,
                }}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!disabled) setEditingMark(mark);
                      }}
                      className={`relative ${severitySizes[mark.severity]} ${damageTypeColors[mark.type]} ${severityColors[mark.severity]} rounded-full cursor-pointer hover:scale-110 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center group/button`}
                    >
                      {/* Number Badge */}
                      <span className="text-white font-bold text-[10px] z-10 drop-shadow-lg">
                        {index + 1}
                      </span>
                      {/* Pulse animation for major severity */}
                      {mark.severity === "major" && (
                        <span className="absolute inset-0 rounded-full animate-ping opacity-75 bg-red-600"></span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="p-3 max-w-[200px] border shadow-xl bg-card">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold underline capitalize">{mark.type}</span>
                        <Badge
                          variant={mark.severity === "major" ? "danger" : mark.severity === "moderate" ? "secondary" : "outline"}
                          className="h-4 text-[10px] px-1"
                        >
                          {mark.severity}
                        </Badge>
                      </div>
                      {mark.description && (
                        <p className="text-[11px] leading-relaxed italic text-muted-foreground border-l-2 border-primary/20 pl-2">
                          {mark.description}
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${mark.type} mark?`)) {
                        handleDeleteMark(mark.id);
                      }
                    }}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center shadow-lg hover:scale-110 z-20"
                    title="Delete mark"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </TooltipProvider>

          {/* Temporary mark position indicator */}
          {tempMark && (
            <div
              className="absolute w-12 h-12 border-4 border-primary border-dashed rounded-full bg-orange-100/30 animate-pulse"
              style={{
                left: `${tempMark.x}%`,
                top: `${tempMark.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 5,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
              </div>
            </div>
          )}
        </div>

        {/* Damage List */}
        {damage.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Marked Damage ({damage.length})</h4>
              <Badge variant="secondary" className="text-xs">
                {damage.filter(m => m.severity === "major").length} Major
                {damage.filter(m => m.severity === "moderate").length > 0 && `, ${damage.filter(m => m.severity === "moderate").length} Moderate`}
                {damage.filter(m => m.severity === "minor").length > 0 && `, ${damage.filter(m => m.severity === "minor").length} Minor`}
              </Badge>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {damage.map((mark, index) => (
                <div
                  key={mark.id}
                  className="flex items-center justify-between p-3 bg-card rounded-lg border border-border hover:border-border hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`relative ${severitySizes[mark.severity]} ${damageTypeColors[mark.type]} ${severityColors[mark.severity]} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white font-bold text-xs drop-shadow">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold capitalize">
                          {mark.type}
                        </span>
                        <Badge
                          variant={mark.severity === "major" ? "danger" : mark.severity === "moderate" ? "warning" : "success"}
                          className="text-xs capitalize"
                        >
                          {mark.severity}
                        </Badge>
                      </div>
                      {mark.description && (
                        <div className="text-xs text-muted-foreground mt-1 truncate" title={mark.description}>
                          {mark.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {!disabled && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingMark(mark)}
                        className="h-8 w-8 p-0"
                        title="Edit mark"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete ${mark.type} mark?`)) {
                            handleDeleteMark(mark.id);
                          }
                        }}
                        className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                        title="Delete mark"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!disabled && damage.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click on the vehicle diagram above to mark damage locations
          </p>
        )}
      </CardContent>

      {/* Damage Mark Dialog */}
      <Dialog open={!!tempMark || !!editingMark} onOpenChange={() => {
        setTempMark(null);
        setEditingMark(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMark ? "Edit Damage Mark" : "Add Damage Mark"}</DialogTitle>
            <DialogDescription>
              {editingMark
                ? "Update the damage information"
                : "Provide details about the damage at this location"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="damage-type">Damage Type *</Label>
              <Select
                value={editingMark?.type || (tempMark ? newMarkData.type || "scratch" : "")}
                onValueChange={(value: DamageMark["type"]) => {
                  if (editingMark) {
                    setEditingMark({ ...editingMark, type: value });
                  } else if (tempMark) {
                    setNewMarkData({ ...newMarkData, type: value });
                  }
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scratch">Scratch</SelectItem>
                  <SelectItem value="dent">Dent</SelectItem>
                  <SelectItem value="chip">Chip</SelectItem>
                  <SelectItem value="crack">Crack</SelectItem>
                  <SelectItem value="rust">Rust</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="damage-severity">Severity *</Label>
              <Select
                value={editingMark?.severity || (tempMark ? newMarkData.severity || "minor" : "")}
                onValueChange={(value: DamageMark["severity"]) => {
                  if (editingMark) {
                    setEditingMark({ ...editingMark, severity: value });
                  } else if (tempMark) {
                    setNewMarkData({ ...newMarkData, severity: value });
                  }
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="major">Major</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="damage-description">Description</Label>
              <Textarea
                id="damage-description"
                value={editingMark?.description || (tempMark ? newMarkData.description || "" : "")}
                onChange={(e) => {
                  if (editingMark) {
                    setEditingMark({ ...editingMark, description: e.target.value });
                  } else if (tempMark) {
                    setNewMarkData({ ...newMarkData, description: e.target.value });
                  }
                }}
                placeholder="Additional details about the damage..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setTempMark(null);
                setEditingMark(null);
                setNewMarkData({ type: "scratch", severity: "minor", description: "" });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const markData: Partial<DamageMark> = editingMark
                  ? {
                    type: editingMark.type,
                    severity: editingMark.severity,
                    description: editingMark.description || "",
                  }
                  : {
                    type: (newMarkData.type || "scratch") as DamageMark["type"],
                    severity: (newMarkData.severity || "minor") as DamageMark["severity"],
                    description: newMarkData.description || "",
                  };
                handleSaveMark(markData);
              }}
            >
              {editingMark ? "Update" : "Add"} Damage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

