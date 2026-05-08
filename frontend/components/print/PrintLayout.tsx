"use client";

import { ReactNode } from 'react';
import { COMPANY_NAME } from '@/lib/constants';

export type WatermarkType = 'PAID' | 'UNPAID' | 'DRAFT' | 'VOID' | 'COPY' | null;

interface PrintLayoutProps {
    children: ReactNode;
    documentType?: string;
    documentNumber?: string;
    watermark?: WatermarkType;
    showHeader?: boolean;
    showFooter?: boolean;
    className?: string;
    additionalHeaderInfo?: ReactNode;
    companyInfo?: {
        name?: string;
        address?: string;
        phone?: string;
        website?: string;
    };
    metaInfo?: ReactNode;
}

export function PrintLayout({
    children,
    documentType,
    documentNumber,
    watermark,
    showHeader = true,
    showFooter = true,
    companyInfo,
    className = '',
    metaInfo,
    additionalHeaderInfo
}: PrintLayoutProps) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const companyName = companyInfo?.name || COMPANY_NAME;
    const companyInitial = companyName.trim().charAt(0).toUpperCase() || 'S';

    return (
        <div id="print-content-root" className={`print-container ${className}`}>
            {/* Watermark */}
            {watermark && (
                <div
                    className={`watermark watermark-${watermark.toLowerCase()}`}
                    aria-hidden="true"
                >
                    {watermark}
                </div>
            )}

            {showHeader && (
                <div className="flex justify-between items-start gap-3 mb-3 pb-2 border-b-2 border-black print-header">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 bg-muted rounded flex shrink-0 items-center justify-center font-bold text-muted-foreground text-base print-header-logo">
                            {companyInitial}
                        </div>

                        <div className="company-details min-w-0">
                            <h1 className="text-lg font-bold text-foreground leading-tight mb-1">{companyName}</h1>
                            {(companyInfo?.address || companyInfo?.phone) && (
                                <div className="text-xs text-muted-foreground leading-snug">
                                    {companyInfo?.address && <p>{companyInfo.address}</p>}
                                    {companyInfo?.phone && <p>{companyInfo.phone}</p>}
                                </div>
                            )}
                            {additionalHeaderInfo}
                        </div>
                    </div>

                    {companyInfo?.website && (
                        <div className="text-right text-xs text-muted-foreground shrink-0">
                            <p>{companyInfo.website}</p>
                        </div>
                    )}
                </div>
            )}

            {/* 2. Document Title Bar */}
            {documentType && (
                <div className="flex justify-between items-end mb-6 pb-2 border-b border-border print-section">
                    <div className="text-left">
                        <div className="text-2xl font-bold uppercase text-primary leading-none mb-1">{documentType}</div>
                        <div className="text-lg font-bold text-foreground leading-none"># {documentNumber}</div>
                    </div>

                    <div className="text-right text-sm">
                        {metaInfo}
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="print-content">
                {children}
            </div>

            {/* Footer */}
            {showFooter && (
                <div className="print-footer mt-4 pt-2 border-t border-border text-center text-xs text-muted-foreground print-only">
                    <p>{companyName}{companyInfo?.website ? ` | ${companyInfo.website}` : ''}</p>
                    <div className="mt-1 flex justify-center items-center gap-4">
                        <span>Generated on {currentDate}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
