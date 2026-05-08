"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "./dialog";
import { Label } from "./label";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Upload, FileText, AlertCircle, CheckCircle, X, Download, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import { previewCSV, validateCSVFile, CSVPreview } from "@/lib/utils/csv-preview";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";

export interface ImportResult {
  imported: number;
  skipped: number;
  errors?: string[];
}

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File) => Promise<ImportResult>;
  title: string;
  description?: string;
  accept?: string;
  downloadTemplateUrl?: string;
  templateFileName?: string;
  onDownloadTemplate?: () => void;
}

export function ImportDialog({
  isOpen,
  onClose,
  onImport,
  title,
  description = "Upload a file to import data. Make sure the file matches the required format.",
  accept = ".xlsx",
  downloadTemplateUrl,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  templateFileName = "template.xlsx",
  onDownloadTemplate,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const acceptsExcel = accept.toLowerCase().includes(".xlsx");
  const acceptedExtensions = accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const validateImportFile = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase();
    const matchesAcceptedType = acceptedExtensions.length === 0 || acceptedExtensions.some((extension) => fileName.endsWith(extension));

    if (!matchesAcceptedType) {
      return { valid: false, error: `File must be ${acceptedExtensions.join(" or ")}` };
    }

    if (fileName.endsWith(".csv")) {
      return validateCSVFile(selectedFile);
    }

    if (fileName.endsWith(".xlsx")) {
      return { valid: true };
    }

    return { valid: false, error: "Unsupported file type" };
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file
      const validation = validateImportFile(selectedFile);
      if (!validation.valid) {
        setValidationError(validation.error || "Invalid file");
        setFile(null);
        setPreview(null);
        setShowPreview(false);
        toast({
          title: "Invalid File",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      setValidationError(null);
      setFile(selectedFile);
      setResult(null);
      setPreview(null);
      setShowPreview(false);

      if (selectedFile.name.toLowerCase().endsWith(".csv")) {
        setIsLoadingPreview(true);
        try {
          const csvPreview = await previewCSV(selectedFile, 5);
          setPreview(csvPreview);

        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Failed to preview file";
          toast({
            title: "Preview Error",
            description: message,
            variant: "destructive",
          });
        } finally {
          setIsLoadingPreview(false);
        }
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast({
        title: "No File Selected",
        description: "Please select a file to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      const importResult = await onImport(file);
      setResult(importResult);

      if (importResult.imported > 0) {
        toast({
          title: "Import Successful",
          description: `Successfully imported ${importResult.imported} record(s)`,
        });
      }

      if (importResult.skipped > 0) {
        toast({
          title: "Import Completed with Warnings",
          description: `Imported ${importResult.imported} record(s), skipped ${importResult.skipped} record(s)`,
          variant: "warning",
        });
      }

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An error occurred during import";
      toast({
        title: "Import Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    setPreview(null);
    setShowPreview(false);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  // Reset preview when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setResult(null);
      setPreview(null);
      setShowPreview(false);
      setValidationError(null);
    }
  }, [isOpen]);

  const handleDownloadTemplate = () => {
    if (onDownloadTemplate) {
      onDownloadTemplate();
    } else if (downloadTemplateUrl) {
      window.open(downloadTemplateUrl, "_blank");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-semibold text-foreground">{title}</DialogTitle>
            <DialogClose onOpenChange={handleClose} />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          {(downloadTemplateUrl || onDownloadTemplate) && (
            <div className="flex flex-col gap-3 rounded-md border border-primary/15 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2 flex-1">
                <FileText className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-primary">Download {acceptsExcel ? "Excel" : "CSV"} Template</span>
                  <span className="text-xs text-primary/80">Includes sample data and required column structure</span>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadTemplate}
                type="button"
                className="flex-shrink-0"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="file-upload" className="text-sm font-medium text-foreground">Select File</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                id="file-upload"
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                type="button"
                className="flex-1"
              >
                <Upload className="w-4 h-4 mr-2" />
                {file ? file.name : "Choose File"}
              </Button>
            </div>
            {file && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </p>
                {preview && (
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                      className="w-full"
                    >
                      {showPreview ? (
                        <>
                          <EyeOff className="w-4 h-4 mr-2" />
                          Hide Preview
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Preview ({preview.totalRows} rows)
                        </>
                      )}
                    </Button>
                  </div>
                )}
                {isLoadingPreview && (
                  <p className="text-xs text-muted-foreground">Loading preview...</p>
                )}
              </div>
            )}
            {validationError && (
              <p className="text-xs text-destructive mt-1">{validationError}</p>
            )}
          </div>

          {showPreview && preview && (
            <div className="space-y-2 border border-border rounded-md p-3 bg-muted bg-background">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">File Preview</h4>
                <span className="text-xs text-muted-foreground">
                  Showing first {preview.rows.length} of {preview.totalRows} rows
                </span>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-border rounded bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((header, idx) => (
                        <TableHead key={idx} className="text-xs font-semibold bg-muted sticky top-0">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row, rowIdx) => (
                      <TableRow key={rowIdx}>
                        {preview.headers.map((header, colIdx) => (
                          <TableCell key={colIdx} className="text-xs">
                            {row.data[header] || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-2 p-4 bg-muted bg-background rounded-md border border-border">
              <div className="flex items-center gap-2">
                {result.imported > 0 ? (
                  <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                )}
                <span className="font-medium text-sm">
                  Import Results
                </span>
              </div>
              <div className="text-sm space-y-1 ml-7">
                <p className="text-green-700">
                  ✓ Imported: {result.imported} record(s)
                </p>
                {result.skipped > 0 && (
                  <p className="text-yellow-700">
                    ⚠ Skipped: {result.skipped} record(s)
                  </p>
                )}
                {result.errors && result.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-destructive font-medium mb-1">Errors:</p>
                    <ul className="list-disc list-inside text-xs text-destructive space-y-1 max-h-32 overflow-y-auto">
                      {result.errors.slice(0, 10).map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                      {result.errors.length > 10 && (
                        <li className="text-muted-foreground">
                          ... and {result.errors.length - 10} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4">
          <Button variant="secondary" onClick={handleClose} type="button" disabled={isImporting}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={!file || isImporting || !!validationError}
              type="button"
            >
              {isImporting ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
