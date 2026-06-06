import jsPDF from "jspdf";
import type { HelpBlock, HelpGuide, HelpSection } from "./types";

type ManualSection = {
    section: HelpSection;
    guides: HelpGuide[];
};

type DownloadHelpManualPdfOptions = {
    title: string;
    subtitle: string;
    sections: ManualSection[];
    filename?: string;
};

function sanitizeText(value: string) {
    return value
        .replace(/\*\*/g, "")
        .replace(/—/g, "-")
        .replace(/–/g, "-")
        .replace(/→/g, "->")
        .replace(/“|”/g, '"')
        .replace(/‘|’/g, "'")
        .replace(/•/g, "-")
        .replace(/…/g, "...")
        .replace(/\s+/g, " ")
        .trim();
}

export async function downloadHelpManualPdf({
    title,
    subtitle,
    sections,
    filename = "help-manual.pdf",
}: DownloadHelpManualPdfOptions) {
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 40;
    const marginTop = 44;
    const marginBottom = 42;
    const contentWidth = pageWidth - marginX * 2;

    let y = marginTop;

    const setFont = (size: number, style: "normal" | "bold" = "normal") => {
        pdf.setFont("helvetica", style);
        pdf.setFontSize(size);
    };

    const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight > pageHeight - marginBottom) {
            pdf.addPage();
            y = marginTop;
        }
    };

    const writeLine = (text: string, size: number, style: "normal" | "bold" = "normal", x = marginX) => {
        setFont(size, style);
        const cleanText = sanitizeText(text);
        const lineHeight = size * 1.28;
        const lines = pdf.splitTextToSize(cleanText, contentWidth - (x - marginX));
        ensureSpace(lines.length * lineHeight + 4);
        lines.forEach((line: string) => {
            ensureSpace(lineHeight);
            pdf.text(line, x, y);
            y += lineHeight;
        });
    };

    const writeParagraph = (text: string, size = 10) => {
        writeLine(text, size);
        y += 3;
    };

    const writeBulletList = (items: string[]) => {
        items.forEach((item) => {
            const cleanItem = sanitizeText(item);
            const bulletWidth = contentWidth - 16;
            const lines = pdf.splitTextToSize(cleanItem, bulletWidth);
            ensureSpace(lines.length * 13 + 2);
            setFont(10, "normal");
            pdf.text("-", marginX, y);
            pdf.text(lines[0], marginX + 14, y);
            y += 13;
            for (let i = 1; i < lines.length; i += 1) {
                ensureSpace(13);
                pdf.text(lines[i], marginX + 14, y);
                y += 13;
            }
            y += 2;
        });
    };

    const writeNumberedList = (items: string[]) => {
        items.forEach((item, index) => {
            const prefix = `${index + 1}.`;
            const cleanItem = sanitizeText(item);
            const lines = pdf.splitTextToSize(cleanItem, contentWidth - 28);
            ensureSpace(lines.length * 13 + 2);
            setFont(10, "normal");
            pdf.text(prefix, marginX, y);
            pdf.text(lines[0], marginX + 22, y);
            y += 13;
            for (let i = 1; i < lines.length; i += 1) {
                ensureSpace(13);
                pdf.text(lines[i], marginX + 22, y);
                y += 13;
            }
            y += 2;
        });
    };

    const writeBlock = (block: HelpBlock) => {
        switch (block.type) {
            case "paragraph":
                writeParagraph(block.text);
                return;
            case "note":
                writeParagraph(`Note: ${block.text}`);
                return;
            case "steps":
                writeNumberedList(block.items);
                return;
            case "checklist":
            case "tips":
            case "mistakes":
                if (block.title) {
                    writeLine(block.title, 10, "bold");
                }
                writeBulletList(block.items);
                return;
            case "troubleshooting":
                block.items.forEach((item) => {
                    writeLine(item.problem, 10, "bold");
                    writeParagraph(item.solution);
                });
                return;
            case "screenshot":
                writeParagraph(`${block.label}${block.caption ? ` - ${block.caption}` : ""}`);
                return;
            default:
                return;
        }
    };

    writeLine(title, 18, "bold");
    writeParagraph(subtitle, 11);
    writeParagraph(`Generated from the current Help Center contents.`);
    y += 6;

    sections.forEach(({ section, guides }) => {
        if (guides.length === 0) return;

        ensureSpace(40);
        writeLine(section.title, 14, "bold");
        writeParagraph(section.description, 10);

        guides.forEach((guide) => {
            ensureSpace(40);
            writeLine(guide.title, 12, "bold");
            writeParagraph(guide.description, 10);

            if (guide.responsibilities && guide.responsibilities.length > 0) {
                writeLine("Role Responsibilities", 10, "bold");
                writeBulletList(guide.responsibilities);
            }

            guide.topics.forEach((topic) => {
                ensureSpace(30);
                writeLine(topic.title, 11, "bold");
                if (topic.summary) {
                    writeParagraph(topic.summary);
                }
                topic.blocks.forEach(writeBlock);
                if (topic.actionLabel || topic.actionLink) {
                    writeParagraph(
                        `Action: ${sanitizeText(topic.actionLabel ?? "Open")} ${topic.actionLink ? `(${topic.actionLink})` : ""}`
                    );
                }
                y += 4;
            });
        });
    });

    pdf.save(filename);
}
