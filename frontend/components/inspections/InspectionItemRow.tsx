"use client";

import { InspectionItem, InspectionResult, InspectionPhoto } from "@/lib/api/inspections";
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
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useRef, useState } from "react";

type InspectionResultUpdateValue = InspectionResult[keyof InspectionResult] | undefined | null;

interface InspectionItemRowProps {
    item: InspectionItem;
    result: Partial<InspectionResult>;

    onUpdate: (field: string, value: InspectionResultUpdateValue) => void;
    onAddPhoto?: (itemId: number, file: File, resultId?: number) => void;
    onDeletePhoto?: (photoId: number) => void;
    showNotes: boolean;
    onToggleNotes: () => void;
    isCriticalRemaining: boolean;
    isLast?: boolean;
    allowPhotos?: boolean;
}

export function InspectionItemRow({
    item,
    result,
    onUpdate,
    onAddPhoto,
    onDeletePhoto,
    showNotes,
    onToggleNotes,
    isCriticalRemaining,
    isLast = false,
    allowPhotos = true,
}: InspectionItemRowProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const statusOptions = [
        { value: "pass", label: "Pass", icon: Check, color: "text-success", bg: "bg-success/10", border: "border-green-200", activeBg: "bg-green-600", activeText: "text-white" },
        { value: "fail", label: "Fail", icon: X, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", activeBg: "bg-red-600", activeText: "text-white" },
        { value: "advisory", label: "Advisory", icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", activeBg: "bg-yellow-600", activeText: "text-white" },
        { value: "not_applicable", label: "N/A", icon: Minus, color: "text-muted-foreground", bg: "bg-muted", border: "border-border", activeBg: "bg-gray-600", activeText: "text-white" },
    ];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onAddPhoto) {
            onAddPhoto(item.id, file, result.id);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const hasResult = result.result ||
        (result.measurement_value !== undefined && result.measurement_value !== null) ||
        (result.percentage_value !== undefined && result.percentage_value !== null) ||
        result.rating_value !== undefined ||
        result.condition ||
        result.text_note;

    return (
        <div className={cn(
            "border-b border-border transition-colors",
            isCriticalRemaining && "bg-destructive/10/30 dark:bg-red-950/20 border-l-4 border-l-red-500",
            !isLast && "border-b",
            isLast && "border-b-0"
        )}>
            {/* Main Row */}
            <div className="flex items-center gap-4 p-3 hover:bg-muted/50 hover:bg-muted/50 transition-colors">
                {/* Item Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                        <h4 className={cn(
                            "text-sm font-semibold text-foreground truncate",
                            !hasResult && "text-muted-foreground"
                        )}>
                            {item.name}
                        </h4>
                        {item.is_critical && (
                            <Badge className="bg-red-100 text-destructive dark:bg-red-900/30 dark:text-red-400 text-[9px] font-bold uppercase tracking-wider h-4 px-1.5 py-0">
                                Critical
                            </Badge>
                        )}
                        {hasResult && (
                            <Badge variant="outline" className="h-4 px-1.5 text-[9px] border-green-200 text-green-700 dark:border-green-800 dark:text-green-400">
                                Done
                            </Badge>
                        )}
                    </div>
                    {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                        </p>
                    )}
                </div>

                {/* Status Buttons - Compact */}
                {(item.item_type === "pass_fail" || item.item_type === "yes_no") && (
                    <div className="flex items-center gap-1">
                        {statusOptions.map((opt) => {
                            const Icon = opt.icon;
                            const isActive = result.result === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => onUpdate("result", opt.value)}
                                    aria-pressed={isActive}
                                    aria-label={`${item.name}: ${opt.label}`}
                                    className={cn(
                                        "flex items-center justify-center w-8 h-8 rounded border transition-all",
                                        isActive
                                            ? cn(opt.activeBg, opt.activeText, "border-transparent shadow-sm")
                                            : cn(opt.bg, opt.color, opt.border, "hover:opacity-80")
                                    )}
                                    title={opt.label}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Other Input Types - Inline */}
                {item.item_type === "measurement" && (
                    <div className="flex items-center gap-2 w-32">
                        <Input
                            type="number"
                            value={result.measurement_value !== undefined && result.measurement_value !== null ? result.measurement_value : ""}
                            onChange={(e) => {
                                const val = e.target.value === "" ? undefined : Number(e.target.value);
                                onUpdate("measurement_value", val);
                            }}
                            className="h-8 text-xs"
                            placeholder={item.measurement_unit || "Value"}
                        />
                    </div>
                )}

                {item.item_type === "percentage" && (
                    <div className="flex items-center gap-1 w-24">
                        <Input
                            type="number"
                            max={100}
                            min={0}
                            value={result.percentage_value !== undefined && result.percentage_value !== null ? result.percentage_value : ""}
                            onChange={(e) => {
                                const val = e.target.value === "" ? undefined : Number(e.target.value);
                                onUpdate("percentage_value", val);
                            }}
                            className="h-8 text-xs pr-6"
                            placeholder="%"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                    </div>
                )}

                {item.item_type === "rating" && (
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => onUpdate("rating_value", n)}
                                className={cn(
                                    "w-7 h-7 text-xs font-semibold rounded border transition-all",
                                    result.rating_value === n
                                        ? "bg-primary text-white border-primary"
                                        : "bg-card border-border hover:border-orange-400"
                                )}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                )}

                {item.item_type === "condition" && (
                    <select
                        value={result.condition || ""}
                        onChange={(e) => onUpdate("condition", e.target.value || null)}
                        className="h-8 w-32 rounded-md border border-border bg-card bg-background px-2 text-xs shadow-sm"
                    >
                        <option value="">Select...</option>
                        <option value="excellent">Excellent</option>
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                        <option value="critical">Critical</option>
                    </select>
                )}

                {/* Action Buttons */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "h-7 w-7 p-0",
                            showNotes || result.notes ? "text-primary bg-primary/10 dark:bg-orange-900/20" : "text-muted-foreground"
                        )}
                        onClick={onToggleNotes}
                        title="Notes"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                    </Button>
                    {allowPhotos && (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => fileInputRef.current?.click()}
                                title="Add Photo"
                            >
                                <Camera className="w-3.5 h-3.5" />
                            </Button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-0 space-y-3 border-t border-border bg-muted/50 transition-all">
                    {/* Text Input */}
                    {item.item_type === "text" && (
                        <div className="pt-2">
                            <Textarea
                                value={result.text_note || ""}
                                onChange={(e) => onUpdate("text_note", e.target.value)}
                                className="text-sm min-h-[60px]"
                                placeholder="Enter observations..."
                            />
                        </div>
                    )}

                    {/* Notes */}
                    {(showNotes || result.notes) && (
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 block">
                                Internal Notes
                            </Label>
                            <Textarea
                                placeholder="Additional findings or technician notes..."
                                value={result.notes || ""}
                                onChange={(e) => onUpdate("notes", e.target.value)}
                                className="text-sm min-h-[60px] bg-card"
                            />
                        </div>
                    )}

                    {/* Photos */}
                    {result.photos && result.photos.length > 0 && (
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 block">
                                Photos ({result.photos.length})
                            </Label>
                            <div className="flex flex-wrap gap-2">
                                {result.photos.map((photo: InspectionPhoto) => (
                                    <div key={photo.id} className="relative group w-20 h-20 rounded overflow-hidden border border-border">
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
                        </div>
                    )}

                    {/* Needs Attention */}
                    <div className="pt-2 border-t border-border">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={result.needs_immediate_attention || false}
                                onChange={(e) => onUpdate("needs_immediate_attention", e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-border text-destructive focus:ring-red-500"
                            />
                            <span className={cn(
                                "text-[10px] font-bold uppercase tracking-widest",
                                result.needs_immediate_attention ? "text-destructive" : "text-muted-foreground"
                            )}>
                                Needs Immediate Attention
                            </span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}
