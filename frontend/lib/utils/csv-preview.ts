/**
 * Utility functions for CSV file preview and validation
 */

export interface CSVPreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  errors?: string[];
}

export interface CSVPreview {
  headers: string[];
  rows: CSVPreviewRow[];
  totalRows: number;
  hasErrors: boolean;
}

/**
 * Parse CSV file and return preview data
 */
export async function previewCSV(file: File, maxRows: number = 10): Promise<CSVPreview> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          reject(new Error('CSV file is empty'));
          return;
        }
        
        // Parse headers
        const headers = parseCSVLine(lines[0]);
        
        // Parse rows
        const rows: CSVPreviewRow[] = [];
        const previewLines = lines.slice(1, maxRows + 1);
        
        previewLines.forEach((line, index) => {
          const rowData = parseCSVLine(line);
          const row: CSVPreviewRow = {
            rowNumber: index + 2, // +2 because index is 0-based and we skip header
            data: {},
            errors: [],
          };
          
          // Map data to headers
          headers.forEach((header, colIndex) => {
            row.data[header] = rowData[colIndex] || '';
          });
          
          rows.push(row);
        });
        
        resolve({
          headers,
          rows,
          totalRows: lines.length - 1, // Exclude header
          hasErrors: false,
        });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  result.push(current.trim());
  
  return result;
}

/**
 * Validate CSV file before import
 */
export function validateCSVFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return { valid: false, error: 'File must be a CSV file' };
  }
  
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: `File size exceeds maximum allowed size of 10 MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)} MB.` };
  }
  
  return { valid: true };
}

