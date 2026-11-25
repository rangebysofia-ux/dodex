"""Lokal läsbar MCP Skills-server (SEP-2640, MCP Python SDK v2).

Ingen nätverkslyssnare, inga skrivoperationer och ingen åtkomst till persondata.
Starta från projektroten: python -m dodexskills.server
"""

from __future__ import annotations

from pathlib import Path

from .catalog import REPO_ROOT, load_catalog


def create_server(root: Path = REPO_ROOT):
    try:
        from mcp.server.mcpserver import MCPServer
        from mcp.server.mcpserver.resources import TextResource
        from mcp.server.skills import Skills
        from mcp.shared.exceptions import MCPError
        from mcp.shared.skills import (
            GetSkillParams,
            GetSkillResult,
            ListSkillsParams,
            ListSkillsResult,
            Skill,
            SkillResource,
        )
        from mcp.types import INVALID_PARAMS
    except ImportError as exc:
        raise RuntimeError(
            'MCP SDK v2 saknas. Installera med: python -m pip install -e ".[mcp]" '
            "(kräver Python 3.11 eller nyare)."
        ) from exc

    catalog = load_catalog(root=root)
    skills = []
    by_uri = {}
    for entry in catalog:
        skill = Skill(
            uri=entry.uri,
            frontmatter={"name": entry.name, "description": entry.description},
            resources=[
                SkillResource(uri=f.uri, digest=f.digest, size=f.size)
                for f in entry.files
            ],
        )
        skills.append(skill)
        by_uri[skill.uri] = skill

    async def list_skills(ctx, params: ListSkillsParams) -> ListSkillsResult:
        return ListSkillsResult(skills=skills)

    async def get_skill(ctx, params: GetSkillParams) -> GetSkillResult:
        if params.uri not in by_uri:
            raise MCPError(code=INVALID_PARAMS, message="Okänd DODEX-färdighet")
        return GetSkillResult(skill=by_uri[params.uri])

    server = MCPServer("dodex-skills", extensions=[
        Skills(list_skills=list_skills, get_skill=get_skill)
    ])
    for entry in catalog:
        for file in entry.files:
            server.add_resource(TextResource(
                uri=file.uri,
                name=file.relative_path,
                mime_type="text/x-python" if file.relative_path.endswith(".py") else "text/markdown",
                text=file.text,
            ))
    return server


if __name__ == "__main__":
    create_server().run(transport="stdio")
