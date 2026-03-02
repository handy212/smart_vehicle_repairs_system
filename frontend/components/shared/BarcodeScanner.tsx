"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { AlertCircle, Camera, X } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (result: string) => void;
    onError?: (error: string) => void;
    onClose?: () => void;
    aspectRatio?: number;
    qrbox?: { width: number, height: number } | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number, height: number });
}

export function BarcodeScanner({ onScan, onError, onClose, aspectRatio = 1.777778, qrbox }: BarcodeScannerProps) {
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        let mounted = true;

        const startScanner = async () => {
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length) {
                    const html5QrCode = new Html5Qrcode("barcode-scanner-reader");
                    scannerRef.current = html5QrCode;

                    const defaultQrBox = (viewfinderWidth: number, viewfinderHeight: number) => {
                        return {
                            width: viewfinderWidth * 0.8,
                            height: 120
                        };
                    };

                    await html5QrCode.start(
                        { facingMode: "environment" },
                        {
                            fps: 15,
                            qrbox: qrbox || defaultQrBox,
                            aspectRatio: aspectRatio,
                            disableFlip: true,
                        },
                        (decodedText) => {
                            if (mounted) {
                                if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
                                    navigator.vibrate(100);
                                }

                                html5QrCode.stop().then(() => {
                                    onScan(decodedText);
                                }).catch(console.error);
                            }
                        },
                        () => { }
                    );

                    if (mounted) {
                        setIsLoading(false);
                    }
                } else {
                    if (mounted) {
                        const msg = "No cameras found.";
                        setErrorMsg(msg);
                        onError?.(msg);
                    }
                }
            } catch (err: unknown) {
                console.error("Scanner error:", err);
                if (mounted) {
                    const errorObj = err as Error;
                    let msg = errorObj?.message || 'Failed to access camera.';

                    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                        msg = "Camera access usually requires HTTPS when not on localhost. Please use HTTPS or access via localhost for testing.";
                    }

                    setErrorMsg(msg);
                    onError?.(msg);
                }
            }
        };

        const timeoutId = setTimeout(() => {
            startScanner();
        }, 300); // Slightly longer delay to ensure DOM is ready

        return () => {
            mounted = false;
            clearTimeout(timeoutId);
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(e => console.error("Failed to stop scanner:", e));
            }
        };
    }, [onScan, onError, qrbox, aspectRatio]);

    const handleClose = () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => {
                scannerRef.current?.clear();
                onClose?.();
            }).catch(e => {
                console.error("Failed to stop scanner on close:", e);
                onClose?.();
            });
        } else {
            onClose?.();
        }
    };

    return (
        <div className="relative w-full max-w-md mx-auto min-h-[300px] bg-black rounded-lg overflow-hidden flex flex-col items-center justify-center border border-white/10 shadow-2xl">
            {(isLoading && !errorMsg) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 space-y-4">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/70 text-sm animate-pulse">Initializing Camera...</p>
                </div>
            )}

            {errorMsg ? (
                <div className="p-4 text-center text-white/90 space-y-4 z-30">
                    <AlertCircle className="w-10 h-10 mx-auto text-red-500" />
                    <p className="text-sm font-medium">{errorMsg}</p>
                    {onClose && (
                        <Button variant="outline" onClick={handleClose} className="border-white/20 text-white hover:bg-white/10">
                            Close
                        </Button>
                    )}
                </div>
            ) : (
                <>
                    <div id="barcode-scanner-reader" className="w-full h-full absolute inset-0 !border-0" />

                    <div className="absolute top-4 right-4 flex gap-2 z-10">
                        {onClose && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleClose}
                                className="bg-red-500/80 hover:bg-red-500 backdrop-blur-sm shadow-lg"
                            >
                                <X className="w-4 h-4 mr-1" />
                                Cancel
                            </Button>
                        )}
                    </div>

                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <div className="w-[85%] h-[120px] border-2 border-primary/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] relative">
                            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary" />
                            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary" />
                            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary" />
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary" />
                        </div>
                    </div>

                    <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10 pointer-events-none px-4">
                        <div className="bg-black/70 text-white px-4 py-2 rounded-full text-xs flex items-center gap-2 max-w-full text-center backdrop-blur-md border border-white/20 shadow-xl">
                            <Camera className="w-4 h-4 shrink-0 text-primary" />
                            <span className="leading-tight font-medium">Align barcode within the frame</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
