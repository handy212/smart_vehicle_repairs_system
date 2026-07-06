"use client";

import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "lucide-react";

interface ExportDropdownProps {
    onExportCSV: () => void;
    onExportExcel: () => void;
    onExportPDF?: () => void;
    disabled?: boolean;
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm" | "lg";
}

export function ExportDropdown({
    onExportCSV,
    onExportExcel,
    onExportPDF,
    disabled = false,
    variant = "outline",
    size = "sm"
}: ExportDropdownProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant={variant} size={size} disabled={disabled} className="gap-2">
                    <Download className="w-4 h-4" />
                    Export
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onExportCSV} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-success" />
                    Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportExcel} className="cursor-pointer">
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-success" />
                    Export formatted Excel
                </DropdownMenuItem>
                {onExportPDF && (
                    <DropdownMenuItem onClick={onExportPDF} className="cursor-pointer">
                        <FileText className="w-4 h-4 mr-2" />
                        Export as PDF
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
