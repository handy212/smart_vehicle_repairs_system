"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { vehiclesApi } from "@/lib/api/vehicles";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

interface VINDecoderButtonProps {
  vin: string;
  /** When editing, pass the current vehicle id so its own VIN is not treated as a duplicate. */
  excludeVehicleId?: number;
  /** When set, also persist decoded specs onto this vehicle (edit / profile flows). */
  persistVehicleId?: number;
  onDecode: (data: {
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    engine_type?: string;
    engine_size?: string;
    transmission_type?: string;
    body_class?: string;
    vehicle_type?: string;
    manufacturer?: string;
    vin_other_information?: {
      series?: string;
      trim?: string;
      gvwr?: string;
      drive_type?: string;
      body_class?: string;
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
    vin_full_data?: any;
  }) => void;
  disabled?: boolean;
}

export function VINDecoderButton({
  vin,
  excludeVehicleId,
  persistVehicleId,
  onDecode,
  disabled,
}: VINDecoderButtonProps) {
  const [isDecoding, setIsDecoding] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

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
      const result = await vehiclesApi.decodeVin(vin.toUpperCase(), {
        excludeVehicleId,
      });

      if (result.success) {
        if (result.exists && result.vehicle) {
          const vehicle = result.vehicle as any;
          const vehicleDisplayName =
            vehicle.display_name ||
            `${vehicle.year} ${vehicle.make} ${vehicle.model}` ||
            `Vehicle #${vehicle.id}`;

          toast({
            title: "Vehicle Already Exists",
            description: `${vehicleDisplayName} with this VIN already exists in the system.`,
            variant: "warning",
          });

          if (result.vehicle_id && typeof window !== "undefined") {
            setTimeout(() => {
              if (
                confirm(
                  `A vehicle with this VIN already exists.\n\n${vehicleDisplayName}\n\nWould you like to view the existing vehicle?`
                )
              ) {
                router.push(`/vehicles/${result.vehicle_id}`);
              }
            }, 500);
          }
        } else {
          const decodedData: any = {};
          if (result.year) decodedData.year = result.year;
          if (result.make) decodedData.make = result.make;
          if (result.model) decodedData.model = result.model;
          if (result.trim) decodedData.trim = result.trim;
          if (result.engine_type) decodedData.engine_type = result.engine_type;
          if (result.engine_size) decodedData.engine_size = result.engine_size;
          if (result.transmission_type) decodedData.transmission_type = result.transmission_type;
          if (result.body_class) decodedData.body_class = result.body_class;
          if (result.vehicle_type) decodedData.vehicle_type = result.vehicle_type;
          if (result.manufacturer) decodedData.manufacturer = result.manufacturer;

          decodedData.vin_full_data = (result as any).full_data;
          decodedData.vin_other_information = {
            series: (result as any).series,
            trim: (result as any).trim,
            gvwr: (result as any).gvwr,
            drive_type: (result as any).drive_type,
            body_class: (result as any).body_class,
            cylinders: (result as any).engine_cylinders ?? null,
            primary_fuel_type: (result as any).fuel_type_primary,
            secondary_fuel_type: (result as any).fuel_type_secondary,
            electrification_level: (result as any).electrification_level,
            engine_model: (result as any).engine_model,
            engine_hp: (result as any).engine_hp ?? null,
            engine_manufacturer: (result as any).engine_manufacturer,
            transmission_speed: (result as any).transmission_speeds,
            transmission_style: (result as any).transmission_style,
            engine_displacement_l: (result as any).engine_displacement_l,
            airbags: {
              front: (result as any).airbag_front,
              knee: (result as any).airbag_knee,
              side: (result as any).airbag_side,
              curtain: (result as any).airbag_curtain,
              seat_cushion: (result as any).airbag_seat_cushion,
              other_restraint_info: (result as any).other_restraint_info,
            },
          };

          onDecode(decodedData);

          if (persistVehicleId) {
            try {
              await vehiclesApi.refreshVinDecode(persistVehicleId, { force: true });
              queryClient.invalidateQueries({ queryKey: ["vehicle", persistVehicleId] });
            } catch (persistError) {
              console.error("VIN persist error:", persistError);
              toast({
                title: "Decoded (not saved yet)",
                description:
                  "Form fields were filled. Save the vehicle, or use Decode VIN specs on the profile if specs did not store.",
                variant: "warning",
              });
              return;
            }
          }

          toast({
            title: "VIN Decoded Successfully",
            description: result.summary || "Vehicle details have been updated from the VIN",
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
      const isTimeout =
        error?.code === "ECONNABORTED" ||
        (typeof error?.message === "string" && error.message.toLowerCase().includes("timeout"));
      toast({
        title: "Error",
        description: getUserFacingError(
          error,
          isTimeout
            ? "VIN decode timed out (NHTSA may be unreachable from this server). You can enter details manually."
            : "Failed to decode VIN. Please try again."
        ),
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
