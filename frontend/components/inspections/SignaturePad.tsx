"use client";

import { useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string; // Base64 encoded signature image
  onChange?: (signature: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  width?: number;
  height?: number;
  showPreview?: boolean;
}

export function SignaturePad({
  value,
  onChange,
  label = "Signature",
  required = false,
  disabled = false,
  width = 500,
  height = 200,
  showPreview = false,
}: SignaturePadProps) {
  const sigPadRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (!sigPadRef.current) return;

    sigPadRef.current.clear();
    if (value) {
      sigPadRef.current.fromDataURL(value);
    }
  }, [value]);

  const handleClear = () => {
    if (sigPadRef.current) {
      sigPadRef.current.clear();
      onChange?.(null);
    }
  };

  const handleEnd = () => {
    if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
      const dataURL = sigPadRef.current.toDataURL();
      onChange?.(dataURL);
    } else {
      onChange?.(null);
    }
  };

  return (
    <Card className="overflow-hidden border-border shadow-none">
      <CardHeader className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs font-semibold">
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </CardTitle>
            {value && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                <CheckCircle2 className="h-3 w-3" />
                Signed
              </span>
            )}
          </div>
          {!disabled && value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 px-2 text-xs"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div 
          className={cn(
            "overflow-hidden rounded-md border border-dashed bg-card",
            disabled ? "pointer-events-none opacity-50" : "border-border",
            !disabled && "border-border"
          )}
        >
          <SignatureCanvas
            ref={sigPadRef}
            canvasProps={{
              width,
              height,
              className: "signature-canvas w-full",
              style: disabled ? { pointerEvents: "none" } : undefined,
            }}
            onEnd={handleEnd}
            penColor="#000000"
            backgroundColor="#ffffff"
          />
        </div>
        {showPreview && value && (
          <div className="mt-2">
            <img
              src={value}
              alt="Signature preview"
              className="max-w-xs border border-border rounded"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
