import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PDFOptions {
    filename: string;
    orientation?: 'p' | 'portrait' | 'l' | 'landscape';
    format?: string | number[];
    scale?: number;
}

export const generatePDF = async (elementId: string | HTMLElement, options: PDFOptions) => {
    try {
        const element = typeof elementId === 'string' ? document.getElementById(elementId) : elementId;

        if (!element) {
            throw new Error('Element not found');
        }

        // Add specific class for PDF generation capturing
        element.classList.add('pdf-capture-mode');

        const canvas = await html2canvas(element, {
            scale: options.scale || 2, // Higher scale for better quality
            useCORS: true, // Allow loading images from other domains
            logging: false,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            ignoreElements: (element) => element.classList.contains('no-print')
        });

        // Remove the capturing class
        element.classList.remove('pdf-capture-mode');

        const imgData = canvas.toDataURL('image/png');

        // Calculate dimensions
        const pdf = new jsPDF({
            orientation: options.orientation || 'portrait',
            unit: 'mm',
            format: options.format || 'a4',
        });

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add subsequent pages if content is long
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(options.filename);
        return true;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};
