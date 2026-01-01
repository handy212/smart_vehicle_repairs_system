"use client";

import { InspectionItem, InspectionResult, InspectionPhoto } from "@/lib/api/inspections";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Check,
    X,
    AlertTriangle,
    Minus,
    Camera,
    MessageSquare,
    Trash2,
    AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useRef } from "react";

interface InspectionItemCardProps {
    item: InspectionItem;
    result: Partial<InspectionResult>;
    onUpdate: (field: string, value: any) => void;
    onAddPhoto?: (itemId: number, file: File, resultId?: number) => void;
    onDeletePhoto?: (photoId: number) => void;
    showNotes: boolean;
    onToggleNotes: () => void;
    isCriticalRemaining: boolean;
}

export function InspectionItemCard({
    item,
    result,
    onUpdate,
    onAddPhoto,
    onDeletePhoto,
    showNotes,
    onToggleNotes,
    isCriticalRemaining,
}: InspectionItemCardProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const statusOptions = [
        { value: "pass", label: "Pass", icon: Check, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", activeBg: "bg-green-600", activeText: "text-white" },
        { value: "fail", label: "Fail", icon: X, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", activeBg: "bg-red-600", activeText: "text-white" },
        { value: "advisory", label: "Advisory", icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", activeBg: "bg-yellow-600", activeText: "text-white" },
        { value: "not_applicable", label: "N/A", icon: Minus, color: "text-gray-500", bg: "bg-gray-50", border: "border-gray-200", activeBg: "bg-gray-600", activeText: "text-white" },
    ];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onAddPhoto) {
            onAddPhoto(item.id, file, result.id);
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <Card className={cn(
            "shadow-none border transition-all duration-200",
            isCriticalRemaining ? "border-red-500 ring-1 ring-red-500/20 bg-red-50/10" : "border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700"
        )}>
            <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                                {item.name}
                            </h4>
                            {item.is_critical && (
                                <Badge className="bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider h-4 px-1">
                                    Critical
                                </Badge>
                            )}
                        </div>
                        {item.description && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">
                                {item.description}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-7 px-2 text-[10px] font-bold uppercase tracking-widest",
                                showNotes || result.notes ? "bg-blue-50 text-blue-600 border-blue-200" : "text-gray-400"
                            )}
                            onClick={onToggleNotes}
                        >
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Notes
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Camera className="w-3 h-3 mr-1" />
                            Photo
                        </Button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </div>
                </div>

                {/* Status Selection */}
                {(item.item_type === "pass_fail" || item.item_type === "yes_no") && (
                    <div className="grid grid-cols-4 gap-2">
                        {statusOptions.map((opt) => {
                            const Icon = opt.icon;
                            const isActive = result.result === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => onUpdate("result", opt.value)}
                                    className={cn(
                                        "flex flex-col items-center justify-center gap-1 py-2 rounded-lg border transition-all duration-200",
                                        isActive
                                            ? cn(opt.activeBg, opt.activeText, "border-transparent shadow-sm")
                                            : cn(opt.bg, opt.color, opt.border, "hover:opacity-80")
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">{opt.label}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Other Input Types */}
                <div className="mt-3 space-y-3">
                    {item.item_type === "measurement" && (
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest min-w-[80px]">
                                {item.measurement_unit || "Value"}
                            </Label>
                            <Input
                                type="number"
                                value={result.measurement_value || ""}
                                onChange={(e) => onUpdate("measurement_value", Number(e.target.value))}
                                className="h-9 text-sm"
                                placeholder="Enter value..."
                            />
                        </div>
                    )}

                    {item.item_type === "percentage" && (
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest min-w-[80px]">
                                Percentage
                            </Label>
                            <div className="relative flex-1">
                                <Input
                                    type="number"
                                    max={100}
                                    value={result.percentage_value || ""}
                                    onChange={(e) => onUpdate("percentage_value", Number(e.target.value))}
                                    className="h-9 text-sm pr-8"
                                    placeholder="0 - 100"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                            </div>
                        </div>
                    )}

                    {item.item_type === "rating" && (
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest min-w-[80px]">
                                Rating
                            </Label>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => onUpdate("rating_value", n)}
                                        className={cn(
                                            "w-8 h-8 text-[11px] font-bold rounded border transition-all duration-200",
                                            result.rating_value === n
                                                ? "bg-blue-600 text-white border-blue-600"
                                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400"
                                        )}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {item.item_type === "condition" && (
                        <div className="flex items-center gap-3">
                            <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest min-w-[80px]">
                                Condition
                            </Label>
                            <select
                                value={result.condition || ""}
                                onChange={(e) => onUpdate("condition", e.target.value || null)}
                                className="flex-1 h-9 rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">Select condition...</option>
                                <option value="excellent">Excellent</option>
                                <option value="good">Good</option>
                                <option value="fair">Fair</option>
                                <option value="poor">Poor</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                    )}

                    {item.item_type === "text" && (
                        <div className="space-y-1.5">
                            <Label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                                Notes
                            </Label>
                            <Textarea
                                value={result.text_note || ""}
                                onChange={(e) => onUpdate("text_note", e.target.value)}
                                className="text-sm min-h-[60px]"
                                placeholder="Enter observations..."
                            />
                        </div>
                    )}
                </div>

                {/* Expandable Notes */}
                {(showNotes || result.notes) && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">
                            Internal Notes
                        </Label>
                        <Textarea
                            placeholder="Additional findings or technician notes..."
                            value={result.notes || ""}
                            onChange={(e) => onUpdate("notes", e.target.value)}
                            className="text-sm min-h-[60px] bg-gray-50/50 dark:bg-gray-800/50"
                        />
                    </div>
                )}

                {/* Photos Preview */}
                {result.photos && result.photos.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 animate-in fade-in zoom-in-95 duration-200">
                        {result.photos.map((photo: InspectionPhoto) => (
                            <div key={photo.id} className="relative group w-16 h-16 rounded overflow-hidden border border-gray-100 dark:border-gray-800">
                                <Image
                                    src={photo.image}
                                    alt="Inspection"
                                    fill
                                    className="object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => onDeletePhoto && onDeletePhoto(photo.id)}
                                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <Trash2 className="w-4 h-4 text-white" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Needs Attention Toggle */}
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={result.needs_immediate_attention || false}
                            onChange={(e) => onUpdate("needs_immediate_attention", e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                        />
                        <span className={cn(
                            "text-[10px] font-bold uppercase tracking-widest transition-colors",
                            result.needs_immediate_attention ? "text-red-600" : "text-gray-400 group-hover:text-gray-600"
                        )}>
                            Needs Immediate Attention
                        </span>
                    </label>
                </div>
            </CardContent>
        </Card>
    );
}
