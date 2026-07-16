'use client';

import React, { useRef } from 'react';
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
import { Printer, Download } from 'lucide-react';
import { Branch } from '@/lib/api/branches';
import { useBranding } from '@/lib/hooks/useBranding';

interface QRPrintDialogProps {
    branch: Branch | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function QRPrintDialog({ branch, open, onOpenChange }: QRPrintDialogProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const { siteName, companyName } = useBranding("public");

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
              @page { size: A4 portrait; margin: 10mm; }
              body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; }
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
              border: 2px solid #111827;
              padding: 24mm 18mm;
              max-width: 180mm;
              width: 100%;
              box-sizing: border-box;
            }
            h1 { font-size: 28pt; margin: 0 0 8mm; color: #111827; line-height: 1.1; }
            h2 { font-size: 14pt; margin: 0 0 14mm; color: #475569; }
            .qr-container {
              background: white;
              padding: 8mm;
              border: 1px solid #cbd5e1;
              display: inline-block;
              margin-bottom: 12mm;
            }
            .qr-code { width: 82mm; height: 82mm; display: block; }
            .instructions { font-size: 13pt; color: #334155; margin: 0 0 10mm; line-height: 1.35; }
            .footer { font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6mm; }
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
              <p>${siteName}</p>
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
                <DialogContent className="max-w-xl">
                <DialogClose onOpenChange={onOpenChange} />
                <DialogHeader>
                    <DialogTitle>Print Feedback Poster</DialogTitle>
                    <DialogDescription>
                        Preview and print a poster for <strong>{branch.name}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex justify-center p-4 bg-muted/30 rounded border border-dashed border-border overflow-hidden">
                    {/* Poster Preview */}
                    <div
                        ref={printRef}
                        className="bg-card p-8 shadow-inner border border-border flex flex-col items-center text-center space-y-4 max-w-xs"
                    >
                        <h1 className="text-xl font-bold text-foreground leading-tight">We Value Your Feedback</h1>
                        <p className="text-xs font-medium text-muted-foreground uppercase">{branch.name}</p>

                        <div className="bg-card p-3 border border-border">
                            <img
                                src={qrCodeUrl}
                                className="w-44 h-44"
                                alt="QR Code Preview"
                            />
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Scan the QR code to share your suggestions, compliments, or complaints.
                        </p>

                        <div className="pt-3 border-t border-border w-full">
                            <p className="text-[10px] text-muted-foreground">{siteName}</p>
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
