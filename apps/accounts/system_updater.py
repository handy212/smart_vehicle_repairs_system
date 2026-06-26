"""
Bare-metal system update checks and helpers for the admin UI updater.
"""
from __future__ import annotations

import logging
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

COMMIT_RE = re.compile(r'^[0-9a-f]{7,40}$', re.IGNORECASE)


class SystemUpdaterError(Exception):
    """Base error for updater operations."""


@dataclass
class UpdateAvailability:
    available: bool
    deployed_commit: str | None
    deployed_short: str | None
    deployed_message: str | None
    remote_commit: str | None
    remote_short: str | None
    remote_message: str | None
    git_ref: str
    commits_behind: int | None
    check_error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            'available': self.available,
            'deployed_commit': self.deployed_commit,
            'deployed_short': self.deployed_short,
            'deployed_message': self.deployed_message,
            'remote_commit': self.remote_commit,
            'remote_short': self.remote_short,
            'remote_message': self.remote_message,
            'git_ref': self.git_ref,
            'commits_behind': self.commits_behind,
            'check_error': self.check_error,
        }


def source_dir() -> Path:
    return Path(getattr(settings, 'SYSTEM_UPDATE_SOURCE_DIR', '/opt/smart_vehicle_repairs_system'))


def target_dir() -> Path:
    return Path(getattr(settings, 'SYSTEM_UPDATE_TARGET_DIR', '/var/www/svr'))


def run_script() -> Path:
    return Path(getattr(settings, 'SYSTEM_UPDATE_RUN_SCRIPT', source_dir() / 'deploy/run-system-update.sh'))


def default_git_ref() -> str:
    return getattr(settings, 'SYSTEM_UPDATE_GIT_REF', 'main')


def git_repo_url() -> str:
    return getattr(
        settings,
        'SYSTEM_UPDATE_GIT_URL',
        'https://github.com/handy212/smart_vehicle_repairs_system.git',
    )


def is_bare_metal_layout() -> bool:
    source = source_dir()
    target = target_dir()
    return (
        source.is_dir()
        and target.is_dir()
        and (source / 'deploy' / 'update-production.sh').is_file()
        and (target / 'manage.py').is_file()
    )


def sudo_runner_configured() -> bool:
    script = run_script()
    if not script.is_file():
        return False
    try:
        result = subprocess.run(
            ['sudo', '-n', str(script), '--probe'],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def updater_status() -> dict[str, Any]:
    return {
        'enabled': bool(getattr(settings, 'SYSTEM_UPDATE_ENABLED', False)),
        'bare_metal_layout': is_bare_metal_layout(),
        'sudo_configured': sudo_runner_configured(),
        'source_dir': str(source_dir()),
        'target_dir': str(target_dir()),
        'git_ref': default_git_ref(),
        'can_check': is_bare_metal_layout(),
        'can_apply': (
            bool(getattr(settings, 'SYSTEM_UPDATE_ENABLED', False))
            and is_bare_metal_layout()
            and sudo_runner_configured()
        ),
    }


def _read_commit_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    value = path.read_text(encoding='utf-8').strip().splitlines()[0].strip()
    return value if COMMIT_RE.match(value) else None


def _git_rev_parse(repo: Path, rev: str = 'HEAD') -> str | None:
    if not (repo / '.git').exists():
        return None
    try:
        result = subprocess.run(
            ['git', '-C', str(repo), 'rev-parse', rev],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return None
        value = result.stdout.strip()
        return value if COMMIT_RE.match(value) else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _git_log_message(repo: Path, commit: str | None) -> str | None:
    if not commit or not (repo / '.git').exists():
        return None
    try:
        result = subprocess.run(
            ['git', '-C', str(repo), 'log', '-1', '--format=%s', commit],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        return None


def _remote_commit(ref: str | None = None) -> str | None:
    ref = ref or default_git_ref()
    try:
        result = subprocess.run(
            ['git', 'ls-remote', git_repo_url(), f'refs/heads/{ref}'],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode != 0:
            raise SystemUpdaterError(result.stderr.strip() or 'Unable to contact git remote.')
        line = result.stdout.strip().splitlines()
        if not line:
            return None
        commit = line[0].split()[0].strip()
        return commit if COMMIT_RE.match(commit) else None
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SystemUpdaterError(str(exc)) from exc


def _commits_behind(repo: Path, from_commit: str, to_commit: str) -> int | None:
    if from_commit == to_commit:
        return 0
    if not (repo / '.git').exists():
        return None
    try:
        result = subprocess.run(
            ['git', '-C', str(repo), 'rev-list', '--count', f'{from_commit}..{to_commit}'],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return None
        return int(result.stdout.strip())
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None


def deployed_commit() -> str | None:
    target = target_dir()
    commit = _read_commit_file(target / 'DEPLOYED_COMMIT')
    if commit:
        return commit
    return _git_rev_parse(target)


def check_for_updates(ref: str | None = None) -> UpdateAvailability:
    ref = ref or default_git_ref()
    source = source_dir()
    deployed = deployed_commit() or _git_rev_parse(source)
    deployed_message = _git_log_message(source, deployed)

    remote = None
    remote_message = None
    commits_behind = None
    check_error = None

    try:
        remote = _remote_commit(ref)
        if remote:
            remote_message = _git_log_message(source, remote)
            if deployed and remote:
                commits_behind = _commits_behind(source, deployed, remote)
    except SystemUpdaterError as exc:
        check_error = str(exc)
        logger.warning('Update check failed: %s', exc)

    available = bool(
        deployed
        and remote
        and deployed != remote
        and not check_error
    )

    return UpdateAvailability(
        available=available,
        deployed_commit=deployed,
        deployed_short=deployed[:7] if deployed else None,
        deployed_message=deployed_message,
        remote_commit=remote,
        remote_short=remote[:7] if remote else None,
        remote_message=remote_message,
        git_ref=ref,
        commits_behind=commits_behind,
        check_error=check_error,
    )
