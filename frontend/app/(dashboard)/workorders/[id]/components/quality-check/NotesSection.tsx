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
        <div className="space-y-3">
            {/* Result toggle */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    <Label className="text-xs font-bold text-foreground">QC Result</Label>
                </div>
                <div className="flex items-center bg-muted/30 p-0.5 rounded-md border border-border/40">
                    <Button
                        type="button"
                        variant={passed ? "default" : "ghost"}
                        size="sm"
                        className={passed
                            ? "h-6 px-3 text-[10px] font-bold shadow-sm bg-green-600 hover:bg-green-700 rounded-sm"
                            : "h-6 px-3 text-[10px] text-muted-foreground rounded-sm"
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
                            ? "h-6 px-3 text-[10px] font-bold shadow-sm rounded-sm"
                            : "h-6 px-3 text-[10px] text-muted-foreground rounded-sm"
                        }
                        onClick={() => setPassed(false)}
                    >
                        FAIL
                    </Button>
                </div>
            </div>

            {/* Notes area */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                    <Label htmlFor="notes" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Observations
                    </Label>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-5 text-[9px] font-bold text-primary border-primary/20 hover:bg-primary/5 px-2 gap-1"
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
                    className="resize-none bg-background border-border/40 focus:border-primary/40 text-sm leading-relaxed p-2.5"
                />
            </div>
        </div>
    );
}
