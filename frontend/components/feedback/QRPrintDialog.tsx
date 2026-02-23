'use client';

import React, { useRef, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Printer, X, Download } from 'lucide-react';
import { Branch } from '@/lib/api/branches';
import { useQuery } from '@tanstack/react-query';
import { adminApi, SystemSetting } from '@/lib/api/admin';

interface QRPrintDialogProps {
    branch: Branch | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function QRPrintDialog({ branch, open, onOpenChange }: QRPrintDialogProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const { data: brandingSettings } = useQuery<SystemSetting[]>({
        queryKey: ["settings", "branding", "public"],
        queryFn: () => adminApi.settings.publicBranding(),
        staleTime: 5 * 60 * 1000,
    });

    const branding = useMemo(() => {
        if (!brandingSettings) {
            return {
                site_name: "Smart Repairs",
                company_name: "Smart Vehicle Repairs",
            };
        }

        const getSetting = (key: string): string | null => {
            const setting = brandingSettings.find((s) => s.key === key);
            return setting?.value && setting.value.trim() !== "" ? setting.value : null;
        };

        return {
            site_name: getSetting("site_name") || "Smart Repairs",
            company_name: getSetting("company_name") || "Smart Vehicle Repairs",
        };
    }, [brandingSettings]);

    if (!branch) return null;

    const feedbackUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/feedback?branch=${branch.code}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(feedbackUrl)}`;

    const handlePrint = () => {
        const printContent = printRef.current;
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
      <html>
        <head>
          <title>Print Feedback Poster - ${branch.name}</title>
          <style>
            @media print {
              @page { size: portrait; margin: 0; }
              body { margin: 0; padding: 2cm; font-family: sans-serif; }
            }
            body { 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              text-align: center;
              color: #1a1a1a;
            }
            .container {
              border: 8px solid #3b82f6;
              padding: 3rem;
              border-radius: 2rem;
              max-width: 800px;
              width: 100%;
            }
            h1 { font-size: 3.5rem; margin-bottom: 1rem; color: #1e3a8a; }
            h2 { font-size: 2rem; margin-bottom: 3rem; color: #64748b; }
            .qr-container {
              background: white;
              padding: 2rem;
              border: 2px solid #e2e8f0;
              border-radius: 1.5rem;
              display: inline-block;
              margin-bottom: 3rem;
            }
            .qr-code { width: 400px; height: 400px; }
            .instructions { font-size: 1.5rem; color: #475569; margin-bottom: 2rem; }
            .footer { font-size: 1rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 2rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>We Value Your Feedback!</h1>
            <h2>${branch.name}</h2>
            <div class="qr-container">
              <img src="${qrCodeUrl}" class="qr-code" alt="QR Code" />
            </div>
            <p class="instructions">Scan the QR code to share your suggestions, compliments, or complaints.</p>
            <div class="footer">
              <p>${branding.site_name}</p>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              window.onafterprint = () => window.close();
            };
          </script>
        </body>
      </html>
    `);
        printWindow.document.close();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogClose onOpenChange={onOpenChange} />
                <DialogHeader>
                    <DialogTitle>Print Feedback Poster</DialogTitle>
                    <DialogDescription>
                        Preview and print a poster for <strong>{branch.name}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex justify-center p-8 bg-muted/30 rounded-lg border border-dashed border-border overflow-hidden">
                    {/* Poster Preview */}
                    <div
                        ref={printRef}
                        className="bg-white p-12 rounded-xl shadow-inner border-t-[10px] border-t-primary flex flex-col items-center text-center space-y-6 max-w-sm"
                    >
                        <h1 className="text-2xl font-bold text-slate-900">We Value Your Feedback!</h1>
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{branch.name}</p>

                        <div className="bg-white p-4 border-2 border-slate-100 rounded-lg">
                            <img
                                src={qrCodeUrl}
                                className="w-48 h-48"
                                alt="QR Code Preview"
                            />
                        </div>

                        <p className="text-sm text-slate-600">
                            Scan the QR code to share your suggestions, compliments, or complaints.
                        </p>

                        <div className="pt-4 border-t border-slate-100 w-full">
                            <p className="text-[10px] text-slate-400">{branding.site_name}</p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-end">
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => {
                            const link = document.createElement('a');
                            link.href = qrCodeUrl;
                            link.download = `qr-feedback-${branch.code}.png`;
                            link.click();
                        }}>
                            <Download className="mr-2 h-4 w-4" />
                            Save QR
                        </Button>
                        <Button onClick={handlePrint}>
                            <Printer className="mr-2 h-4 w-4" />
                            Print Poster
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
