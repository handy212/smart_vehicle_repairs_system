"use client";

import { Button } from "@/components/ui/button";
import { Printer, Download, Mail } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useState } from "react";

interface PrintControlsProps {
    onPrint?: () => void;
    onDownloadPDF?: () => void;
    onEmail?: () => void;
    showEmail?: boolean;
    isLoading?: boolean;
    className?: string;
}

export function PrintControls({
    onPrint,
    onDownloadPDF,
    onEmail,
    showEmail = false,
    isLoading = false,
    className = ''
}: PrintControlsProps) {
    const handlePrint = () => {
        if (onPrint) {
            onPrint();
        } else {
            window.print();
        }
    };

    return (
        <div className={`print-controls no-print flex gap-3 items-center justify-end mb-6 ${className}`}>
            <Button
                variant="outline"
                size="default"
                onClick={handlePrint}
                disabled={isLoading}
            >
                <Printer className="w-4 h-4 mr-2" />
                Print
            </Button>

            {onDownloadPDF && (
                <Button
                    variant="outline"
                    size="default"
                    onClick={onDownloadPDF}
                    disabled={isLoading}
                >
                    <Download className="w-4 h-4 mr-2" />
                    {isLoading ? 'Generating...' : 'Download PDF'}
                </Button>
            )}

            {showEmail && onEmail && (
                <Button
                    variant="outline"
                    size="default"
                    onClick={onEmail}
                    disabled={isLoading}
                >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                </Button>
            )}
        </div>
    );
}
