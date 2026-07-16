"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { AlertCircle, Camera, X, RefreshCw, ShieldAlert } from 'lucide-react';

interface BarcodeScannerProps {
    onScan: (result: string) => void;
    onError?: (error: string) => void;
    onClose?: () => void;
    aspectRatio?: number;
    qrbox?: { width: number, height: number } | ((viewfinderWidth: number, viewfinderHeight: number) => { width: number, height: number });
}

type ScannerState = 'requesting' | 'scanning' | 'error';

function getPermissionErrorMessage(error: unknown): string {
    const err = error as Error;
    const name = err?.name || '';
    const message = (err?.message || '').toLowerCase();

    if (name === 'NotAllowedError' || message.includes('permission denied') || message.includes('not allowed')) {
        return 'Camera permission was denied. Please allow camera access in your browser settings, then tap "Try Again".';
    }
    if (name === 'NotFoundError' || message.includes('requested device not found') || message.includes('no video')) {
        return 'No camera found on this device.';
    }
    if (name === 'NotReadableError' || message.includes('could not start video source')) {
        return 'Camera is being used by another application. Close other apps and try again.';
    }
    if (name === 'OverconstrainedError') {
        return 'The requested camera is not available on this device.';
    }
    if (name === 'AbortError') {
        return 'Camera access was interrupted. Please try again.';
    }
    if (name === 'SecurityError' || message.includes('secure')) {
        return 'Camera requires a secure connection (HTTPS).';
    }

    return err?.message || 'Failed to access camera. Please check your browser settings.';
}

export function BarcodeScanner({ onScan, onError, onClose, aspectRatio = 1.777778, qrbox }: BarcodeScannerProps) {
    const [state, setState] = useState<ScannerState>('requesting');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);
    const containerId = useRef(`barcode-reader-${Date.now()}`);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (e) {
                console.error("Error stopping scanner:", e);
            }
            scannerRef.current = null;
        }
    }, []);

    const requestPermissionAndStart = useCallback(async () => {
        setState('requesting');
        setErrorMsg(null);

        // Clean up any previous scanner instance
        await stopScanner();

        // Check for mediaDevices API
        if (!navigator?.mediaDevices?.getUserMedia) {
            const msg = 'Camera is not supported in this browser. Please use Chrome, Safari, or Firefox.';
            setState('error');
            setErrorMsg(msg);
            onError?.(msg);
            return;
        }

        // Request camera permission with fallback constraints
        let stream: MediaStream | null = null;
        try {
            // Try back camera first
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } }
            });
        } catch {
            // Fallback: try any camera
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            } catch (fallbackErr) {
                if (!mountedRef.current) return;
                const msg = getPermissionErrorMessage(fallbackErr);
                setState('error');
                setErrorMsg(msg);
                onError?.(msg);
                return;
            }
        }

        // Release the test stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        if (!mountedRef.current) return;

        // Small delay to ensure DOM container is ready and camera is released
        await new Promise(resolve => setTimeout(resolve, 300));

        if (!mountedRef.current) return;

        // Start the html5-qrcode scanner
        try {
            const html5QrCode = new Html5Qrcode(containerId.current);
            scannerRef.current = html5QrCode;

            const defaultQrBox = (viewfinderWidth: number, viewfinderHeight: number) => ({
                width: viewfinderWidth * 0.8,
                height: 120
            });

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 15,
                    qrbox: qrbox || defaultQrBox,
                    aspectRatio,
                    disableFlip: true,
                },
                (decodedText) => {
                    if (mountedRef.current) {
                        if ('vibrate' in navigator) {
                            navigator.vibrate(100);
                        }
                        html5QrCode.stop().then(() => {
                            onScan(decodedText);
                        }).catch(console.error);
                    }
                },
                () => { }
            );

            if (mountedRef.current) {
                setState('scanning');
            }
        } catch (startErr) {
            // If facingMode: environment fails, try without it
            try {
                await stopScanner();
                const html5QrCode = new Html5Qrcode(containerId.current);
                scannerRef.current = html5QrCode;

                const defaultQrBox = (viewfinderWidth: number, viewfinderHeight: number) => ({
                    width: viewfinderWidth * 0.8,
                    height: 120
                });

                await html5QrCode.start(
                    { facingMode: "user" },
                    {
                        fps: 15,
                        qrbox: qrbox || defaultQrBox,
                        aspectRatio,
                        disableFlip: false,
                    },
                    (decodedText) => {
                        if (mountedRef.current) {
                            if ('vibrate' in navigator) {
                                navigator.vibrate(100);
                            }
                            html5QrCode.stop().then(() => {
                                onScan(decodedText);
                            }).catch(console.error);
                        }
                    },
                    () => { }
                );

                if (mountedRef.current) {
                    setState('scanning');
                }
            } catch (fallbackErr) {
                console.error("Scanner start error:", fallbackErr);
                if (mountedRef.current) {
                    const msg = getPermissionErrorMessage(fallbackErr);
                    setState('error');
                    setErrorMsg(msg);
                    onError?.(msg);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onScan, onError, qrbox, aspectRatio, stopScanner]);

    useEffect(() => {
        mountedRef.current = true;

        const timeoutId = setTimeout(() => {
            requestPermissionAndStart();
        }, 100);

        return () => {
            mountedRef.current = false;
            clearTimeout(timeoutId);
            stopScanner();
        };
    }, [requestPermissionAndStart, stopScanner]);

    const handleClose = () => {
        stopScanner().then(() => onClose?.());
    };

    return (
        <div className="relative w-full max-w-md mx-auto min-h-[300px] bg-black rounded-lg overflow-hidden flex flex-col items-center justify-center border border-card/10 shadow-2xl">
            {/* Scanner container — ALWAYS in DOM so html5-qrcode can attach */}
            <div
                id={containerId.current}
                className="w-full h-full absolute inset-0 !border-0"
                style={{ visibility: state === 'scanning' ? 'visible' : 'hidden' }}
            />

            {/* Loading */}
            {state === 'requesting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 space-y-4">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/70 text-sm animate-pulse">Requesting Camera Access...</p>
                    <p className="text-white/40 text-xs text-center px-6">Allow camera access when prompted</p>
                </div>
            )}

            {/* Error */}
            {state === 'error' && errorMsg && (
                <div className="p-6 text-center text-white/90 space-y-4 z-30 relative">
                    <div className="w-14 h-14 mx-auto rounded-full bg-destructive flex items-center justify-center">
                        {errorMsg.includes('denied') || errorMsg.includes('permission')
                            ? <ShieldAlert className="w-7 h-7 text-destructive" />
                            : <AlertCircle className="w-7 h-7 text-destructive" />
                        }
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-white">Camera Access Failed</p>
                        <p className="text-xs text-white/60 leading-relaxed max-w-xs mx-auto">{errorMsg}</p>
                    </div>

                    {(errorMsg.includes('denied') || errorMsg.includes('permission')) && (
                        <div className="bg-card/5 rounded-lg p-3 text-left text-[11px] text-white/50 space-y-1 border border-card/10">
                            <p className="font-semibold text-white/70 mb-1.5">How to enable camera:</p>
                            <p>• <strong>Chrome:</strong> Tap lock icon → Site settings → Camera → Allow</p>
                            <p>• <strong>Safari:</strong> Settings → Safari → Camera → Allow</p>
                            <p>• <strong>Firefox:</strong> Tap lock icon → Clear permissions → Reload</p>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-3 pt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => requestPermissionAndStart()}
                            className="border-card/20 text-white hover:bg-card/10"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            Try Again
                        </Button>
                        {onClose && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClose}
                                className="border-card/20 text-white hover:bg-card/10"
                            >
                                Close
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Scanning overlay */}
            {state === 'scanning' && (
                <>
                    <div className="absolute top-3 right-3 z-10">
                        {onClose && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleClose}
                                className="bg-destructive hover:bg-destructive backdrop-blur-sm shadow-lg h-8 text-xs"
                            >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Cancel
                            </Button>
                        )}
                    </div>

                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[5]">
                        <div className="w-[85%] h-[120px] border-2 border-primary/50 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] relative">
                            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary" />
                            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary" />
                            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary" />
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary" />
                        </div>
                    </div>

                    <div className="absolute bottom-5 left-0 right-0 flex justify-center z-10 pointer-events-none px-4">
                        <div className="bg-black/70 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-2 backdrop-blur-md border border-card/20">
                            <Camera className="w-3.5 h-3.5 shrink-0 text-primary" />
                            <span className="font-medium">Align barcode within the frame</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
