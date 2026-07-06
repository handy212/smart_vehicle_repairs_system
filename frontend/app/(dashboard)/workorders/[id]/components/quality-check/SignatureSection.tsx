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
            <div className="mb-2 flex items-center gap-2">
                <Pen className="h-3.5 w-3.5 text-primary" />
                <Label className="text-xs font-semibold text-foreground">Technician Signature</Label>
                <span className="ml-auto text-[10px] font-medium uppercase text-primary">Required</span>
            </div>
            <SignaturePad
                value={signature || undefined}
                onChange={(val) => setSignature(val)}
                label="Sign to authorize"
                required={true}
                height={80}
            />
        </div>
    );
}
