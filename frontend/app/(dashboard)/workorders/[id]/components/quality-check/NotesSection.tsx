"use client";

import React from "react";
import { Sparkles, MessageSquare } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface NotesSectionProps {
    passed: boolean;
    setPassed: (value: boolean) => void;
    notes: string;
    setNotes: (value: string) => void;
    isAiLoading: boolean;
    handleSuggestNotes: () => void;
    workOrderId?: number;
}

export function NotesSection({
    passed,
    setPassed,
    notes,
    setNotes,
    isAiLoading,
    handleSuggestNotes,
    workOrderId,
}: NotesSectionProps) {
    return (
        <div className="rounded-md border border-border bg-background p-3">
            {/* Result toggle */}
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    <Label className="text-xs font-semibold text-foreground">QC Result</Label>
                </div>
                <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
                    <Button
                        type="button"
                        variant={passed ? "default" : "ghost"}
                        size="sm"
                        className={passed
                            ? "h-6 rounded-sm bg-green-600 px-3 text-[10px] font-semibold hover:bg-green-700"
                            : "h-6 rounded-sm px-3 text-[10px] text-muted-foreground"
                        }
                        onClick={() => setPassed(true)}
                    >
                        PASS
                    </Button>
                    <Button
                        type="button"
                        variant={!passed ? "destructive" : "ghost"}
                        size="sm"
                        className={!passed
                            ? "h-6 rounded-sm px-3 text-[10px] font-semibold"
                            : "h-6 rounded-sm px-3 text-[10px] text-muted-foreground"
                        }
                        onClick={() => setPassed(false)}
                    >
                        FAIL
                    </Button>
                </div>
            </div>

            {/* Notes area */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes" className="text-[10px] font-semibold uppercase text-muted-foreground">
                        Observations
                    </Label>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[10px] text-primary"
                        onClick={handleSuggestNotes}
                        disabled={isAiLoading || !workOrderId}
                    >
                        <Sparkles className={`w-2.5 h-2.5 ${isAiLoading ? "animate-pulse" : ""}`} />
                        {isAiLoading ? "Analyzing..." : "AI Suggest"}
                    </Button>
                </div>
                <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Findings, adjustments, or reasons for failure..."
                    className="min-h-[70px] resize-none bg-card text-sm leading-relaxed"
                />
            </div>
        </div>
    );
}
