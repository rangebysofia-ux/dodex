"""Läs redan befintliga Dodex-färdigheter utan AI- eller MCP-beroenden.

Allt innehåll kommer från de versionshanterade Copilot-färdigheterna.
Inget laddas ned, körs eller ändras av denna modul.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Mapping

REPO_ROOT = Path(__file__).resolve().parents[1]

# En enda källa för kunskap och referenser. Behåll nuvarande Copilot-filer.
SKILL_SOURCES: dict[str, str] = {
    "dodex-bemanningsanalys": "copilot/dodex-bemanningsanalys/skill/dodex-bemanningsanalys",
    "dodex-grundschemaanalys": "copilot/grundschema-analys/skill/dodex-grundschemaanalys",
    "dodex-schemamall": "copilot/dodex-schemamall/skill/dodex-schemamall",
    "dodex-schemastod": "copilot/dodex-helhet/skill/dodex-schemastod",
}
ALLOWED_SUFFIXES = {".md", ".txt", ".json", ".py"}
MAX_FILE_BYTES = 512_000
MAX_SKILL_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True)
class SkillFile:
    uri: str
    relative_path: str
    text: str
    digest: str
    size: int


@dataclass(frozen=True)
class SkillEntry:
    name: str
    description: str
    files: tuple[SkillFile, ...]

    @property
    def uri(self) -> str:
        return f"skill://{self.name}/SKILL.md"


def _frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("SKILL.md saknar YAML-frontmatter")
    fields: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            if not fields.get("name") or not fields.get("description"):
                raise ValueError("SKILL.md måste ha name och description")
            return fields
        key, sep, value = line.partition(":")
        if sep and key.strip() in ("name", "description"):
            value = value.strip()
            if value.startswith('"'):
                value = json.loads(value)
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            fields[key.strip()] = value
    raise ValueError("SKILL.md saknar avslutande ---")


def _source_files(folder: Path):
    """Tillåt bara SKILL.md samt kända referens- och skriptmappar."""
    for candidate in sorted(folder.rglob("*")):
        if candidate.is_symlink():
            raise ValueError(f"Symboliska länkar tillåts inte: {candidate}")
        if not candidate.is_file():
            continue
        relative = candidate.relative_to(folder)
        permitted = relative.as_posix() == "SKILL.md" or (
            len(relative.parts) >= 2
            and relative.parts[0] in ("references", "scripts")
            and candidate.suffix.lower() in ALLOWED_SUFFIXES
            and not any(part.startswith(".") for part in relative.parts)
        )
        if permitted:
            yield candidate, relative


def load_catalog(
    root: Path = REPO_ROOT,
    sources: Mapping[str, str] = SKILL_SOURCES,
) -> tuple[SkillEntry, ...]:
    """Läs det fastställda skill-registret från disk, utan nätverk eller sidoeffekter."""
    root = root.resolve()
    skills = []
    for name, folder_name in sorted(sources.items()):
        folder = (root / folder_name).resolve()
        if not folder.is_relative_to(root) or not folder.is_dir():
            raise ValueError(f"Ogiltig eller saknad färdighetsmapp: {name}")
        skill_md = folder / "SKILL.md"
        if not skill_md.is_file() or skill_md.is_symlink():
            raise ValueError(f"SKILL.md saknas för {name}")
        files = []
        total_bytes = 0
        for path, relative in _source_files(folder):
            raw = path.read_bytes()
            if len(raw) > MAX_FILE_BYTES:
                raise ValueError(f"För stor färdighetsfil: {relative}")
            total_bytes += len(raw)
            if total_bytes > MAX_SKILL_BYTES:
                raise ValueError(f"För stor färdighet: {name}")
            text = raw.decode("utf-8")
            files.append(SkillFile(
                uri=f"skill://{name}/{relative.as_posix()}",
                relative_path=relative.as_posix(),
                text=text,
                digest="sha256:" + hashlib.sha256(raw).hexdigest(),
                size=len(raw),
            ))
        primary = next((f for f in files if f.relative_path == "SKILL.md"), None)
        if primary is None:
            raise ValueError(f"Saknar huvudfil: {name}")
        front = _frontmatter(primary.text)
        if front["name"] != name:
            raise ValueError(f"Fel skill-namn i {name}")
        skills.append(SkillEntry(name=name, description=front["description"], files=tuple(files)))
    return tuple(skills)
