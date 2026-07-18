from __future__ import annotations

from abc import ABC, abstractmethod
from io import BytesIO
from typing import Any

import openpyxl


class BaseExporter(ABC):
    key: str = ''
    label: str = ''
    description: str = ''

    @abstractmethod
    def export(self, options: dict[str, Any] | None = None) -> tuple[BytesIO, str, str]:
        """
        Returns (buffer, filename, content_type).
        """
        raise NotImplementedError

    def _workbook_from_rows(self, headers: list[str], rows: list[list[Any]], sheet_name: str = 'Export'):
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = sheet_name[:31]
        worksheet.append(headers)
        for row in rows:
            worksheet.append(row)
        buffer = BytesIO()
        workbook.save(buffer)
        buffer.seek(0)
        return buffer
