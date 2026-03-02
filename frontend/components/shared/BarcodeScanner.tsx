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
    const message = err?.message || '';

    // NotAllowedError — user denied permission or browser blocked it
    if (name === 'NotAllowedError' || message.includes('Permission denied') || message.includes('permission denied')) {
        return 'Camera permission was denied. Please allow camera access in your browser settings and try again.';
    }

    // NotFoundError — no camera available
    if (name === 'NotFoundError' || message.includes('Requested device not found')) {
        return 'No camera found on this device. Please ensure a camera is connected.';
    }

    // NotReadableError — camera in use by another app
    if (name === 'NotReadableError' || message.includes('Could not start video source')) {
        return 'Camera is in use by another application. Please close other apps using the camera and try again.';
    }

    // OverconstrainedError — requested camera doesn't match constraints
    if (name === 'OverconstrainedError') {
        return 'The requested camera configuration is not supported on this device.';
    }

    // AbortError
    if (name === 'AbortError') {
        return 'Camera access was interrupted. Please try again.';
    }

    // SecurityError — insecure context
    if (name === 'SecurityError' || message.includes('secure context')) {
        return 'Camera access requires a secure connection (HTTPS). Please access the site via HTTPS.';
    }

    // Insecure context check
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        return 'Camera access requires HTTPS. Please access the site using https:// or via localhost.';
    }

    return message || 'Failed to access camera. Please check your browser settings and try again.';
}

export function BarcodeScanner({ onScan, onError, onClose, aspectRatio = 1.777778, qrbox }: BarcodeScannerProps) {
    const [state, setState] = useState<ScannerState>('requesting');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);

    const requestPermissionAndStart = useCallback(async () => {
        setState('requesting');
        setErrorMsg(null);

        // Step 1: Check for secure context
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            const msg = 'Camera access requires a secure connection (HTTPS). Please access via https:// or localhost.';
            setState('error');
            setErrorMsg(msg);
            onError?.(msg);
            return;
        }

        // Step 2: Check for mediaDevices API
        if (!navigator?.mediaDevices?.getUserMedia) {
            const msg = 'Camera access is not supported in this browser. Please use a modern browser like Chrome, Safari, or Firefox.';
            setState('error');
            setErrorMsg(msg);
            onError?.(msg);
            return;
        }

        // Step 3: Explicitly request camera permission
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            // Permission granted — stop the test stream immediately
            stream.getTracks().forEach(track => track.stop());
        } catch (permErr) {
            if (!mountedRef.current) return;
            const msg = getPermissionErrorMessage(permErr);
            setState('error');
            setErrorMsg(msg);
            onError?.(msg);
            return;
        }

        // Step 4: Start the html5-qrcode scanner (permission already granted)
        try {
            const html5QrCode = new Html5Qrcode("barcode-scanner-reader");
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
                    aspectRatio: aspectRatio,
                    disableFlip: true,
                },
                (decodedText) => {
                    if (mountedRef.current) {
                        // Haptic feedback on scan
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
        } catch (err) {
            console.error("Scanner start error:", err);
            if (mountedRef.current) {
                const msg = getPermissionErrorMessage(err);
                setState('error');
                setErrorMsg(msg);
                onError?.(msg);
            }
        }
    }, [onScan, onError, qrbox, aspectRatio]);

    useEffect(() => {
        mountedRef.current = true;

        // Small delay to ensure DOM container is ready
        const timeoutId = setTimeout(() => {
            requestPermissionAndStart();
        }, 200);

        return () => {
            mountedRef.current = false;
            clearTimeout(timeoutId);
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(e => console.error("Failed to stop scanner:", e));
            }
        };
    }, [requestPermissionAndStart]);

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

    const handleRetry = async () => {
        // Stop any existing scanner
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
                scannerRef.current.clear();
            } catch (e) {
                console.error("Error stopping scanner before retry:", e);
            }
            scannerRef.current = null;
        }
        requestPermissionAndStart();
    };

    return (
        <div className="relative w-full max-w-md mx-auto min-h-[300px] bg-black rounded-lg overflow-hidden flex flex-col items-center justify-center border border-white/10 shadow-2xl">
            {/* Loading / Requesting Permission */}
            {state === 'requesting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20 space-y-4">
                    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <p className="text-white/70 text-sm animate-pulse">Requesting Camera Access...</p>
                    <p className="text-white/40 text-xs text-center px-6">Please allow camera access when prompted by your browser</p>
                </div>
            )}

            {/* Error State */}
            {state === 'error' && errorMsg && (
                <div className="p-6 text-center text-white/90 space-y-4 z-30">
                    <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                        {errorMsg.includes('denied') || errorMsg.includes('permission')
                            ? <ShieldAlert className="w-8 h-8 text-red-400" />
                            : <AlertCircle className="w-8 h-8 text-red-400" />
                        }
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-white">Camera Access Failed</p>
                        <p className="text-xs text-white/60 leading-relaxed max-w-xs mx-auto">{errorMsg}</p>
                    </div>

                    {/* Permission instructions */}
                    {(errorMsg.includes('denied') || errorMsg.includes('permission')) && (
                        <div className="bg-white/5 rounded-lg p-3 text-left text-[11px] text-white/50 space-y-1.5 border border-white/10">
                            <p className="font-semibold text-white/70">How to enable camera:</p>
                            <p>• <strong>Chrome:</strong> Tap the lock icon in the address bar → Site settings → Camera → Allow</p>
                            <p>• <strong>Safari:</strong> Settings → Safari → Camera → Allow</p>
                            <p>• <strong>Firefox:</strong> Tap the lock icon → Clear permissions → Reload</p>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-3 pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRetry}
                            className="border-white/20 text-white hover:bg-white/10"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            Try Again
                        </Button>
                        {onClose && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleClose}
                                className="border-white/20 text-white hover:bg-white/10"
                            >
                                Close
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Scanner Active */}
            {state === 'scanning' && (
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

            {/* Scanner container — must always be in DOM for html5-qrcode */}
            {state !== 'scanning' && (
                <div id="barcode-scanner-reader" className="hidden" />
            )}
        </div>
    );
}
