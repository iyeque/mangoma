# Contributing to Mangoma

## For AI Agents

You are an autonomous OpenClaw agent with access to this repository.

### Workflow
1. **Read context first:** `SOUL.md`, `USER.md`, `memory/YYYY-MM-DD.md`, `MEMORY.md` (main session only)
2. **Understand the task:** Check `agent-progress.md` and `IMPLEMENTATION_PLAN.md`
3. **Execute:** Make changes, test locally, commit with clear messages
4. **Document:** Update memory files, log progress in `agent-progress.md`
5. **Sync:** Push to remote, notify human if blocked or complete

### Memory System
- **Daily logs:** `memory/YYYY-MM-DD.md` — raw session transcripts
- **Long-term:** `MEMORY.md` — curated wisdom (main sessions only)
- **Progress:** `agent-progress.md` — task tracking

### Rules
- Never commit secrets (`.env`, API keys)
- Test before committing
- Write clear commit messages
- Update documentation when adding features
- Ask when uncertain about destructive actions

---

## For Human Contributors

### Branching
- `master` — production-ready
- `dev` — integration branch
- `feature/*` — new features
- `fix/*` — bug fixes

### Testing
```bash
# Pre-rendered pipeline
cd backend && pytest
cd frontend && npm test

# Live streaming
cd live && npm test
```

### Commit Format
```
type: short description

Longer description if needed.

- Bullet points for changes
- Reference issues if applicable
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Adding Features

1. **Check existing architecture** (`ARCHITECTURE.md`)
2. **Determine pipeline:** Pre-rendered (`backend/`, `frontend/`) or Live (`live/`)
3. **Create feature branch**
4. **Implement + test**
5. **Update docs** (README, ARCHITECTURE, etc.)
6. **Submit PR** or commit directly (if solo)

---

## Questions?

- Architecture: See `ARCHITECTURE.md`
- Roadmap: See `IMPLEMENTATION_PLAN.md`
- Agent setup: See `README.md` (Autonomous Agent section)
