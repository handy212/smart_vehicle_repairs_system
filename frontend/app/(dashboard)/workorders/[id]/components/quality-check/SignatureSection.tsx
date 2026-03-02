"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import { Pen } from "lucide-react";
import { SignaturePad } from "@/components/inspections/SignaturePad";

interface SignatureSectionProps {
    signature: string | null;
    setSignature: (value: string | null) => void;
}

export function SignatureSection({ signature, setSignature }: SignatureSectionProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
                <Pen className="w-3.5 h-3.5 text-primary" />
                <Label className="text-xs font-bold text-foreground">Technician Signature</Label>
                <span className="text-[8px] font-bold text-primary uppercase tracking-wider ml-auto">Required</span>
            </div>
            <div className="bg-background rounded-lg border border-border/40 overflow-hidden">
                <SignaturePad
                    value={signature || undefined}
                    onChange={(val) => setSignature(val)}
                    label="Sign to authorize"
                    required={true}
                    height={100} // Override default 200 height to make it compact
                />
            </div>
        </div>
    );
}
