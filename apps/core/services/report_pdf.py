"""Compact ReportLab helpers for tabular PDF exports."""
from __future__ import annotations

from io import BytesIO
from typing import Iterable, Sequence

from django.http import HttpResponse
from django.utils import timezone


def build_table_pdf_response(
    *,
    title: str,
    filename: str,
    headers: Sequence[str],
    rows: Iterable[Sequence[object]],
    subtitle: str | None = None,
    summary: Sequence[str] | None = None,
    landscape: bool = False,
    max_rows: int | None = None,
) -> HttpResponse:
    """Render a compact, consistent table report as a PDF response."""
    pdf = build_table_pdf(
        title=title,
        headers=headers,
        rows=rows,
        subtitle=subtitle,
        summary=summary,
        landscape=landscape,
        max_rows=max_rows,
    )
    response = HttpResponse(pdf.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def build_table_pdf(
    *,
    title: str,
    headers: Sequence[str],
    rows: Iterable[Sequence[object]],
    subtitle: str | None = None,
    summary: Sequence[str] | None = None,
    landscape: bool = False,
    max_rows: int | None = None,
) -> BytesIO:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape as landscape_page
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph

    buffer = BytesIO()
    page_size = landscape_page(A4) if landscape else A4
    doc = SimpleDocTemplate(
        buffer,
        pagesize=page_size,
        leftMargin=8 * mm,
        rightMargin=8 * mm,
        topMargin=8 * mm,
        bottomMargin=8 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CompactTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=15,
        alignment=0,
        spaceAfter=4,
    )
    meta_style = ParagraphStyle(
        "CompactMeta",
        parent=styles["Normal"],
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#4b5563"),
        spaceAfter=6,
    )
    cell_style = ParagraphStyle(
        "CompactCell",
        parent=styles["Normal"],
        fontSize=6.5,
        leading=8,
        wordWrap="CJK",
    )

    story = [Paragraph(title, title_style)]
    meta = subtitle or f"Generated on {timezone.now().strftime('%Y-%m-%d %H:%M')}"
    story.append(Paragraph(meta, meta_style))

    clean_rows: list[list[Paragraph]] = [[Paragraph(str(header), cell_style) for header in headers]]
    limit = max_rows if max_rows is not None else None
    for index, row in enumerate(rows):
        if limit is not None and index >= limit:
            break
        clean_rows.append([Paragraph(_clean_cell(value), cell_style) for value in row])

    table = Table(clean_rows, repeatRows=1)
    table.setStyle(get_compact_table_style())
    story.append(table)

    if summary:
        story.append(Spacer(1, 5 * mm))
        for line in summary:
            story.append(Paragraph(str(line), meta_style))

    doc.build(story)
    buffer.seek(0)
    return buffer


def get_compact_table_style():
    from reportlab.lib import colors
    from reportlab.platypus import TableStyle

    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#111827")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 6.5),
        ("LEADING", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#9ca3af")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
    ])


def _clean_cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
