"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { X, Camera, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BarcodeScannerProps {
    onScan: (data: string) => void;
    onCancel: () => void;
}

export function BarcodeScanner({ onScan, onCancel }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
    const [error, setError] = useState<string>("");
    const readerRef = useRef<BrowserMultiFormatReader | null>(null);

    useEffect(() => {
        const codeReader = new BrowserMultiFormatReader();
        readerRef.current = codeReader;

        codeReader.listVideoInputDevices()
            .then((videoInputDevices) => {
                setDevices(videoInputDevices);
                if (videoInputDevices.length > 0) {
                    // Try to strongly prefer the back camera
                    const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes("back"));
                    setSelectedDeviceId(backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId);
                } else {
                    setError("No camera devices found");
                }
            })
            .catch((err) => {
                setError(`Camera error: ${err.message}`);
            });

        return () => {
            codeReader.reset();
        };
    }, []);

    useEffect(() => {
        if (!selectedDeviceId || !videoRef.current || !readerRef.current) return;

        const codeReader = readerRef.current;
        codeReader.reset();

        codeReader.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            (result, err) => {
                if (result) {
                    onScan(result.getText());
                }
                if (err && !(err instanceof NotFoundException)) {
                    console.error("Scanning error:", err);
                }
            }
        ).catch((err) => {
            setError(`Feed error: ${err.message}`);
        });

        return () => {
            codeReader.reset();
        };
    }, [selectedDeviceId, onScan]);

    const handleSwitchCamera = () => {
        if (devices.length > 1) {
            const currentIndex = devices.findIndex(d => d.deviceId === selectedDeviceId);
            const nextIndex = (currentIndex + 1) % devices.length;
            setSelectedDeviceId(devices[nextIndex].deviceId);
        }
    };

    return (
        <div className="flex flex-col space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="relative rounded-lg overflow-hidden border bg-black aspect-video flex items-center justify-center">
                {!selectedDeviceId && !error ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Camera className="h-8 w-8 mb-2 animate-pulse" />
                        <p className="text-sm">Initializing camera...</p>
                    </div>
                ) : (
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                    />
                )}

                {/* Scanning overlay UI */}
                <div className="absolute inset-0 pointer-events-none p-8">
                    <div className="w-full h-full border-2 border-primary/50 rounded-lg relative">
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary" />

                        {/* Animated scanning line */}
                        <div className="absolute left-0 right-0 h-0.5 bg-primary/50 animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center px-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSwitchCamera}
                    disabled={devices.length <= 1}
                >
                    <RefreshCcw className="h-4 w-4 mr-2" />
                    Switch Camera
                </Button>

                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                </Button>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes scan {
                    0% { top: 0; }
                    50% { top: 100%; box-shadow: 0 0 10px 2px rgba(99, 102, 241, 0.5); }
                    100% { top: 0; }
                }
            `}} />
        </div>
    );
}
