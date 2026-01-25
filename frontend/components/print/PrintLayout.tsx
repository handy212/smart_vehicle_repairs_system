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

            {/* 1. Main Header: Logo & Company Info */}
            <div className="flex justify-between items-center mb-4 pb-2 border-b-2 border-black print-header">
                <div className="flex items-center gap-4">
                    {/* Logo Placeholder */}
                    <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center font-bold text-gray-500 text-lg print-header-logo">S</div>

                    <div className="company-details">
                        <h1 className="text-xl font-bold text-gray-900 leading-none mb-1">{companyInfo?.name || COMPANY_NAME}</h1>
                        <div className="text-xs text-gray-500 space-y-0.5">
                            <p>{companyInfo?.address || '123 Repair Lane, Auto City, AC 12345'}</p>
                            <p>{companyInfo?.phone || '(555) 123-4567'}</p>
                        </div>
                        {additionalHeaderInfo}
                    </div>
                </div>

                {/* Right: Tax/Branch Info */}
                <div className="text-right text-xs text-gray-500">
                    <p>Tax ID: <span className="font-semibold text-black">TR-8842-19</span></p>
                    <p>{companyInfo?.name || COMPANY_NAME} Service Center</p>
                </div>
            </div>

            {/* 2. Document Title Bar */}
            {documentType && (
                <div className="flex justify-between items-end mb-6 pb-2 border-b border-gray-200 print-section">
                    <div className="text-left">
                        <div className="text-2xl font-bold uppercase text-primary leading-none mb-1">{documentType}</div>
                        <div className="text-lg font-bold text-gray-900 leading-none"># {documentNumber}</div>
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
            <div className="print-footer mt-8 pt-4 border-t border-gray-300 text-center text-xs text-gray-500 print-only">
                <p>{companyInfo?.name || COMPANY_NAME} &bull; {companyInfo?.website || 'www.smartvehiclerepairs.com'}</p>
                <div className="mt-1 flex justify-center items-center gap-4">
                    <span>Generated on {currentDate}</span>
                    <span>Page 1 of 1</span>
                </div>
            </div>
        </div>
    );
}
