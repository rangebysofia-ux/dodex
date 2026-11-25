"""Kontrakttester för ett skrivskyddat, leverantörsoberoende skills-bibliotek."""

from pathlib import Path
import hashlib

import pytest

from dodexskills.catalog import SKILL_SOURCES, _frontmatter, load_catalog


def test_alla_befintliga_skills_och_referenser_lasas():
    catalog = load_catalog()
    assert {entry.name for entry in catalog} == set(SKILL_SOURCES)
    assert len(catalog) == 4
    for entry in catalog:
        assert entry.description
        assert entry.uri.startswith("skill://")
        assert any(file.relative_path == "SKILL.md" for file in entry.files)
        assert any(file.relative_path.startswith("references/") for file in entry.files)
        for file in entry.files:
            assert file.uri.startswith(f"skill://{entry.name}/")
            raw = file.text.encode("utf-8")
            assert file.digest == "sha256:" + hashlib.sha256(raw).hexdigest()
            assert file.size == len(raw)


def test_frontmatter_kraver_namn_och_beskrivning():
    with pytest.raises(ValueError):
        _frontmatter("# Fel format")
    with pytest.raises(ValueError):
        _frontmatter("---\nname: test\n---\nText")


def test_katalogen_tillater_inte_sokvag_utanfor_rot(tmp_path: Path):
    with pytest.raises(ValueError, match="Ogiltig"):
        load_catalog(root=tmp_path, sources={"dodex-extern": "../annan-mapp"})


def test_lasar_inga_andra_filer_och_kor_inga_skript(tmp_path: Path):
    skill = tmp_path / "skill"
    (skill / "references").mkdir(parents=True)
    (skill / "scripts").mkdir()
    (skill / "SKILL.md").write_text(
        '---\nname: dodex-test\ndescription: "Testfärdighet"\n---\nBara text.',
        encoding="utf-8",
    )
    (skill / "references" / "regler.md").write_text("Regler", encoding="utf-8")
    (skill / "scripts" / "kod.py").write_text("raise RuntimeError('Får inte köras')", encoding="utf-8")
    (skill / "secret.env").write_text("Ska inte läsas", encoding="utf-8")
    data = load_catalog(root=tmp_path, sources={"dodex-test": "skill"})
    assert [f.relative_path for f in data[0].files] == [
        "SKILL.md", "references/regler.md", "scripts/kod.py"
    ]
    assert "secret.env" not in "".join(f.text for f in data[0].files)


def test_mcp_skapas_med_officiellt_sdk_om_det_ar_installerat():
    pytest.importorskip("mcp.server.skills")
    from dodexskills.server import create_server
    server = create_server()
    assert server is not None
