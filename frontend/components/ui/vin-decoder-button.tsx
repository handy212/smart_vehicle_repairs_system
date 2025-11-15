"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle, CheckCircle } from "lucide-react";
import { vehiclesApi } from "@/lib/api/vehicles";
import { useToast } from "@/lib/hooks/useToast";

interface VINDecoderButtonProps {
  vin: string;
  onDecode: (data: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    engine_type?: string;
    engine_size?: string;
    transmission_type?: string;
  }) => void;
  disabled?: boolean;
}

export function VINDecoderButton({ vin, onDecode, disabled }: VINDecoderButtonProps) {
  const [isDecoding, setIsDecoding] = useState(false);
  const { toast } = useToast();

  const handleDecode = async () => {
    if (!vin || vin.length !== 17) {
      toast({
        title: "Invalid VIN",
        description: "VIN must be exactly 17 characters",
        variant: "destructive",
      });
      return;
    }

    setIsDecoding(true);
    try {
      const result = await vehiclesApi.decodeVin(vin.toUpperCase());

      if (result.success) {
        if (result.exists && result.vehicle) {
          toast({
            title: "Vehicle Found",
            description: `Vehicle with this VIN already exists in the system`,
            variant: "default",
          });
        } else {
          // Auto-fill form fields
          const decodedData: any = {};
          if (result.year) decodedData.year = result.year;
          if (result.make) decodedData.make = result.make;
          if (result.model) decodedData.model = result.model;
          if (result.trim) decodedData.trim = result.trim;
          if (result.engine_type) decodedData.engine_type = result.engine_type;
          if (result.engine_size) decodedData.engine_size = result.engine_size;
          if (result.transmission_type) decodedData.transmission_type = result.transmission_type;

          onDecode(decodedData);

          toast({
            title: "VIN Decoded Successfully",
            description: result.summary || "Vehicle information has been auto-filled",
          });
        }
      } else {
        toast({
          title: "Decode Failed",
          description: result.error || result.error_message || "Failed to decode VIN",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("VIN decode error:", error);
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to decode VIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDecoding(false);
    }
  };

  const isValidVin = vin && vin.length === 17;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleDecode}
      disabled={disabled || isDecoding || !isValidVin}
      className="flex items-center space-x-2"
    >
      {isDecoding ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Decoding...</span>
        </>
      ) : (
        <>
          <Search className="w-4 h-4" />
          <span>Decode VIN</span>
        </>
      )}
    </Button>
  );
}

