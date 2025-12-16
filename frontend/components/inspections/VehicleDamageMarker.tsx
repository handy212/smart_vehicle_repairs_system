"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, MapPin, Trash2, Edit2, Loader2 } from "lucide-react";

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
  scratch: "bg-blue-600",
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
  minor: "w-10 h-10",
  moderate: "w-12 h-12",
  major: "w-14 h-14",
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
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs">
          <div className="font-semibold text-gray-700">Legend:</div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-blue-600"></div>
            <span>Scratch</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-600"></div>
            <span>Dent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span>Chip</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-orange-600"></div>
            <span>Crack</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-amber-800"></div>
            <span>Rust</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-gray-600"></div>
            <span>Other</span>
          </div>
          <div className="ml-2 pl-2 border-l border-gray-300 flex items-center gap-2">
            <span className="text-gray-600">Severity:</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span>Minor</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
              <span>Moderate</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span>Major</span>
            </div>
          </div>
        </div>

        {/* Vehicle Diagram */}
        <div
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="relative w-full h-[600px] border-2 border-gray-300 rounded-lg bg-white cursor-crosshair overflow-hidden"
          style={{ position: "relative" }}
        >
          {/* Loading Skeleton */}
          {imageLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 animate-pulse">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                <p className="text-sm text-gray-500">Loading vehicle diagram...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {imageError && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-center p-8">
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
            className={`w-full h-full object-contain select-none transition-opacity duration-300 ${
              imageLoading ? "opacity-0" : "opacity-100"
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) setEditingMark(mark);
                }}
                className={`relative ${severitySizes[mark.severity]} ${damageTypeColors[mark.type]} ${severityColors[mark.severity]} rounded-full cursor-pointer hover:scale-110 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center group/button`}
                title={`${mark.type.charAt(0).toUpperCase() + mark.type.slice(1)} - ${mark.severity.charAt(0).toUpperCase() + mark.severity.slice(1)}${mark.description ? `: ${mark.description}` : ""}`}
              >
                {/* Number Badge */}
                <span className="text-white font-bold text-sm z-10 drop-shadow-lg">
                  {index + 1}
                </span>
                {/* Pulse animation for major severity */}
                {mark.severity === "major" && (
                  <span className="absolute inset-0 rounded-full animate-ping opacity-75 bg-red-600"></span>
                )}
                {/* Hover label */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover/button:opacity-100 transition-opacity pointer-events-none z-20">
                  {mark.type.charAt(0).toUpperCase() + mark.type.slice(1)} - {mark.severity.charAt(0).toUpperCase() + mark.severity.slice(1)}
                </div>
              </button>
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

          {/* Temporary mark position indicator */}
          {tempMark && (
            <div
              className="absolute w-12 h-12 border-4 border-blue-500 border-dashed rounded-full bg-blue-100/30 animate-pulse"
              style={{
                left: `${tempMark.x}%`,
                top: `${tempMark.y}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 5,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
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
                  className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
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
                        <div className="text-xs text-gray-600 mt-1 truncate" title={mark.description}>
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
          <p className="text-sm text-gray-500 text-center py-4">
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
              <select
                id="damage-type"
                value={editingMark?.type || (tempMark ? newMarkData.type || "scratch" : "")}
                onChange={(e) => {
                  const value = e.target.value as DamageMark["type"];
                  if (editingMark) {
                    setEditingMark({ ...editingMark, type: value });
                  } else if (tempMark) {
                    setNewMarkData({ ...newMarkData, type: value });
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mt-1"
              >
                <option value="scratch">Scratch</option>
                <option value="dent">Dent</option>
                <option value="chip">Chip</option>
                <option value="crack">Crack</option>
                <option value="rust">Rust</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <Label htmlFor="damage-severity">Severity *</Label>
              <select
                id="damage-severity"
                value={editingMark?.severity || (tempMark ? newMarkData.severity || "minor" : "")}
                onChange={(e) => {
                  const value = e.target.value as DamageMark["severity"];
                  if (editingMark) {
                    setEditingMark({ ...editingMark, severity: value });
                  } else if (tempMark) {
                    setNewMarkData({ ...newMarkData, severity: value });
                  }
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mt-1"
              >
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="major">Major</option>
              </select>
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

