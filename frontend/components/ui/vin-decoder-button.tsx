"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Extra decoded info for "Other Information" display
    vin_other_information?: {
      series?: string;
      trim?: string;
      gvwr?: string;
      drive_type?: string;
      cylinders?: number | null;
      primary_fuel_type?: string;
      secondary_fuel_type?: string;
      electrification_level?: string;
      engine_model?: string;
      engine_hp?: number | null;
      engine_manufacturer?: string;
      transmission_speed?: string;
      transmission_style?: string;
      engine_displacement_l?: string;
      airbags?: {
        front?: string;
        knee?: string;
        side?: string;
        curtain?: string;
        seat_cushion?: string;
        other_restraint_info?: string;
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vin_full_data?: any;
  }) => void;
disabled ?: boolean;
}

export function VINDecoderButton({ vin, onDecode, disabled }: VINDecoderButtonProps) {
  const [isDecoding, setIsDecoding] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vehicle = result.vehicle as any;
          const vehicleDisplayName = vehicle.display_name ||
            `${vehicle.year} ${vehicle.make} ${vehicle.model}` ||
            `Vehicle #${vehicle.id}`;

          toast({
            title: "Vehicle Already Exists",
            description: `${vehicleDisplayName} with this VIN already exists in the system. Click to view the existing vehicle.`,
            variant: "warning",
          });

          // Store vehicle ID for potential navigation
          if (result.vehicle_id && typeof window !== 'undefined') {
            setTimeout(() => {
              if (confirm(`A vehicle with this VIN already exists.\n\n${vehicleDisplayName}\n\nWould you like to view the existing vehicle?`)) {
                router.push(`/vehicles/${result.vehicle_id}`);
              }
            }, 500);
          }
        } else {
          // Auto-fill form fields
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const decodedData: any = {};
          if (result.year) decodedData.year = result.year;
          if (result.make) decodedData.make = result.make;
          if (result.model) decodedData.model = result.model;
          if (result.trim) decodedData.trim = result.trim;
          if (result.engine_type) decodedData.engine_type = result.engine_type;
          if (result.engine_size) decodedData.engine_size = result.engine_size;
          if (result.transmission_type) decodedData.transmission_type = result.transmission_type;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          decodedData.vin_full_data = (result as any).full_data;
          decodedData.vin_other_information = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          series: (result as any).series,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          trim: (result as any).trim,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          gvwr: (result as any).gvwr,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          drive_type: (result as any).drive_type,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cylinders: (result as any).engine_cylinders ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          primary_fuel_type: (result as any).fuel_type_primary,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          secondary_fuel_type: (result as any).fuel_type_secondary,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          electrification_level: (result as any).electrification_level,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engine_model: (result as any).engine_model,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engine_hp: (result as any).engine_hp ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engine_manufacturer: (result as any).engine_manufacturer,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transmission_speed: (result as any).transmission_speeds,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          transmission_style: (result as any).transmission_style,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          engine_displacement_l: (result as any).engine_displacement_l,
            airbags: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            front: (result as any).airbag_front,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            knee: (result as any).airbag_knee,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            side: (result as any).airbag_side,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            curtain: (result as any).airbag_curtain,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seat_cushion: (result as any).airbag_seat_cushion,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            other_restraint_info: (result as any).other_restraint_info,
            },
        };

        onDecode(decodedData);

        toast({
          title: "VIN Decoded Successfully",
          description: result.summary || "Vehicle Info has been auto-filled",
        });
      }
    } else {
      toast({
        title: "Decode Failed",
        description: result.error || result.error_message || "Failed to decode VIN",
        variant: "destructive",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("VIN decode error:", error);
    const isTimeout =
      error?.code === "ECONNABORTED" ||
      typeof error?.message === "string" && error.message.toLowerCase().includes("timeout");
    toast({
      title: "Error",
      description:
        error.response?.data?.error ||
        (isTimeout
          ? "VIN decode timed out (NHTSA may be unreachable from this server). You can enter details manually."
          : "Failed to decode VIN. Please try again."),
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
    variant="secondary"
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

