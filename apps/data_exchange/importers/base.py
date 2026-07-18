"""Base importer contract for the centralized data exchange framework."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RowIssue:
    row_number: int
    level: str  # error | warning | info
    entity_type: str
    action: str
    identifier: str = ''
    message: str = ''
    code: str = ''
    payload: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {
            'row_number': self.row_number,
            'level': self.level,
            'entity_type': self.entity_type,
            'action': self.action,
            'identifier': self.identifier,
            'message': self.message,
            'code': self.code,
            'payload': self.payload,
        }


def _issue_breakdown(issues: list[RowIssue]) -> list[dict]:
    counts: dict[tuple[str, str], int] = {}
    labels: dict[tuple[str, str], str] = {}
    for issue in issues:
        code = issue.code or issue.action or 'other'
        key = (issue.level, code)
        counts[key] = counts.get(key, 0) + 1
        if key not in labels:
            labels[key] = issue.message
    rows = []
    for (level, code), count in sorted(
        counts.items(),
        key=lambda item: (0 if item[0][0] == 'error' else 1 if item[0][0] == 'warning' else 2, -item[1]),
    ):
        rows.append({
            'level': level,
            'code': code,
            'message': labels[(level, code)],
            'count': count,
        })
    return rows


@dataclass
class ImportPreviewResult:
    format_detected: str
    summary: dict
    issues: list[RowIssue] = field(default_factory=list)
    sample_creates: list[dict] = field(default_factory=list)
    options_echo: dict = field(default_factory=dict)

    def as_dict(self, error_limit: int = 200, warning_limit: int = 50) -> dict:
        errors = [i for i in self.issues if i.level == 'error']
        warnings = [i for i in self.issues if i.level == 'warning']
        infos = [i for i in self.issues if i.level == 'info']
        # Show every error (capped), then a small warning sample — avoid flooding the UI
        shown = errors[:error_limit] + warnings[:warning_limit]
        truncated = max(0, len(errors) - error_limit) + max(0, len(warnings) - warning_limit) + len(infos)
        return {
            'format_detected': self.format_detected,
            'summary': self.summary,
            'error_count': len(errors),
            'warning_count': len(warnings),
            'issue_breakdown': _issue_breakdown(self.issues),
            'issues': [i.as_dict() for i in shown],
            'issues_truncated': truncated,
            'sample_creates': self.sample_creates[:25],
            'options': self.options_echo,
            'can_commit': self.summary.get('vehicles_to_create', 0) > 0
            or self.summary.get('customers_to_create', 0) > 0
            or self.summary.get('parts_to_create', 0) > 0
            or self.summary.get('parts_to_update', 0) > 0
            or self.summary.get('staff_to_create', 0) > 0
            or self.summary.get('staff_to_update', 0) > 0
            or self.summary.get('rows_to_create', 0) > 0,
        }


@dataclass
class ImportCommitResult:
    summary: dict
    created_refs: dict
    issues: list[RowIssue] = field(default_factory=list)

    def as_dict(self, issue_limit: int = 500) -> dict:
        return {
            'summary': self.summary,
            'created_refs': self.created_refs,
            'issues': [i.as_dict() for i in self.issues[:issue_limit]],
            'issues_truncated': max(0, len(self.issues) - issue_limit),
        }


class BaseImporter(ABC):
    key: str = ''
    label: str = ''
    description: str = ''
    supported_extensions: tuple[str, ...] = ('.xlsx',)
    supports_export: bool = False

    def default_options(self) -> dict[str, Any]:
        return {}

    @abstractmethod
    def preview(self, file_obj, options: dict[str, Any] | None = None) -> ImportPreviewResult:
        raise NotImplementedError

    @abstractmethod
    def commit(self, file_obj, options: dict[str, Any] | None = None) -> ImportCommitResult:
        raise NotImplementedError

    def rollback(self, created_refs: dict[str, list[int]]) -> dict[str, Any]:
        """
        Best-effort rollback of objects created by this importer.
        Returns a summary of deleted / skipped counts.
        """
        return {'deleted': {}, 'skipped': {}, 'errors': []}

    def export_queryset(self, options: dict[str, Any] | None = None):
        return None
