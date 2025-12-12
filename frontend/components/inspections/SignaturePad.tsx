"use client";

import { useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

interface SignaturePadProps {
  value?: string; // Base64 encoded signature image
  onChange?: (signature: string | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  width?: number;
  height?: number;
}

export function SignaturePad({
  value,
  onChange,
  label = "Signature",
  required = false,
  disabled = false,
  width = 500,
  height = 200,
}: SignaturePadProps) {
  const sigPadRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    if (value && sigPadRef.current && !sigPadRef.current.isEmpty()) {
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </CardTitle>
          {!disabled && (
            <Button
              type="button"
             variant="secondary"
              size="sm"
              onClick={handleClear}
              disabled={!sigPadRef.current || sigPadRef.current.isEmpty()}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div 
          className={`border-2 border-dashed border-gray-300 rounded-lg bg-white ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
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
        {value && (
          <div className="mt-2">
            <img
              src={value}
              alt="Signature preview"
              className="max-w-xs border border-gray-200 rounded"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

