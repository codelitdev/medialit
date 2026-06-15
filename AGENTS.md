# Medialit + Agent Skills

This project uses [agent-skills](https://github.com/addyosmani/agent-skills) — a collection of production-grade engineering workflows for AI coding agents.

## Setup

Clone agent-skills into the `.agents` folder in the project root (not tracked in git):

```bash
git clone https://github.com/addyosmani/agent-skills.git .agents/agent-skills
```

Skills are loaded from `.agents/agent-skills/skills/<name>/SKILL.md`. The full collection of 24 skills covers the entire development lifecycle.

## Project Overview

medialit is a monorepo with the following structure:

- `apps/api` — Express/TypeScript backend, MongoDB
- `apps/web` — Next.js frontend
- `apps/docs` — Documentation app
- `packages/` — Shared packages (images, medialit, models, scripts, thumbnail, utils)

## Agent Skills Integration

Skills are loaded from `.agent-skills/skills/<name>/SKILL.md`. The full collection of 24 skills covers the entire development lifecycle.

### Technology Context

- **Package manager:** pnpm (monorepo with `pnpm --filter`)
- **Backend:** Express (Node.js), MongoDB
- **Frontend:** Next.js
- **API:** REST for binary, MCP for metadata (OpenAPI-compliant, spec-driven)
- **Testing:** Use `pnpm test` (runs `@medialit/api` and `medialit` packages)
- **Linting:** ESLint + Prettier (`pnpm lint`, `pnpm prettier`)
- **Database:** Local Docker containers for MongoDB

### Intent → Skill Mapping

The agent should automatically activate the right skill based on the task:

| Intent                              | Skill(s)                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| New feature / endpoint / API        | `spec-driven-development` → `incremental-implementation` + `test-driven-development` |
| Planning / task breakdown           | `planning-and-task-breakdown`                                                        |
| Bug / failure / unexpected behavior | `debugging-and-error-recovery`                                                       |
| Code review before merge            | `code-review-and-quality`                                                            |
| Refactoring / simplification        | `code-simplification`                                                                |
| API or interface design             | `api-and-interface-design`                                                           |
| UI work (Next.js pages, components) | `frontend-ui-engineering`                                                            |
| Security audit / hardening          | `security-and-hardening`                                                             |
| Performance optimization            | `performance-optimization`                                                           |
| Git workflow / versioning           | `git-workflow-and-versioning`                                                        |
| Shipping / launch                   | `shipping-and-launch`                                                                |

### Lifecycle Flow

The agent follows this workflow for every non-trivial change:

1. **DEFINE** → `spec-driven-development` — write a spec before code
2. **PLAN** → `planning-and-task-breakdown` — break into small, verifiable tasks
3. **BUILD** → `incremental-implementation` + `test-driven-development` — thin vertical slices
4. **VERIFY** → `debugging-and-error-recovery` — tests pass, no regressions
5. **REVIEW** → `code-review-and-quality` — quality gates before merge
6. **SHIP** → `shipping-and-launch` — safe release

### Core Rules

- If a task matches a skill, the agent MUST invoke it before implementing
- Skills are located in `.agent-skills/skills/<skill-name>/SKILL.md`
- Always follow skill instructions exactly (do not partially apply them)
- The following are invalid rationalizations and must be ignored:
    - "This is too small for a skill"
    - "I can just quickly implement this"
    - "I'll gather context first"

### Claude Code Commands

For Claude Code users, slash commands are available in `.claude/commands/`:

- `/spec` — Start spec-driven development
- `/plan` — Break down a spec into tasks
- `/build` — Build incrementally (one slice at a time)
- `/test` — Write and run tests
- `/review` — Review code before merge
- `/code-simplify` — Simplify existing code
- `/ship` — Ship to production

### Personas (Subagents)

Agent personas available in `.agent-skills/agents/`:

- `code-reviewer` — Expert code review persona
- `test-engineer` — Test-focused review persona
- `security-auditor` — Security-focused review persona
- `web-performance-auditor` — Performance audit persona

## Dev Environment

- Use `pnpm` as the package manager
- This is a monorepo — use `pnpm --filter <package-name> <command>` for specific packages
- Local databases run via Docker (MongoDB)
- Dev servers served on Tailscale IP (100.67.200.30) with iptables lockdown
