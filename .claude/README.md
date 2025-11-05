# Claude Code Configuration

This directory contains Claude Code configuration for the Rockets Server project.

## Files

### settings.json (Committed)
Team-wide Claude Code settings:
- `sessionStart` hook runs `scripts/setup.sh` to configure the environment
- Default model set to Sonnet
- Default shell set to /bin/bash

**This file is committed to git** and shared across the team.

### settings.local.json (Git-ignored)
Personal overrides for Claude Code settings. This file:
- Is git-ignored (not shared with team)
- Overrides settings.json values
- Can contain personal permissions, model preferences, etc.

Example:
```json
{
  "model": {
    "default": "opus"
  }
}
```

## Settings Precedence

Settings are applied in this order (highest precedence last):
1. User global (~/.claude/settings.json)
2. Project team (.claude/settings.json) ← This directory
3. Project local (.claude/settings.local.json)
4. Command-line arguments
5. Enterprise policies (cannot override)

## Session Start Hook

When you start a Claude Code session, the `scripts/setup.sh` script runs automatically to:
1. Verify AGENTS.md and CLAUDE.md exist
2. Check Node.js version (requires 18+)
3. Install/verify Yarn
4. Install project dependencies
5. Build TypeScript packages
6. Run linting checks
7. Display project information

This ensures Claude has a fully configured environment with all dependencies installed.

## Project Context (CLAUDE.md)

The root-level `CLAUDE.md` file imports `AGENTS.md`, which contains comprehensive project architecture documentation. This gives Claude full context about:
- Project structure
- Tech stack
- Development workflows
- Key patterns
- Testing strategy
- Recent changes

## Usage

### On Claude Code Web
1. Go to https://claude.ai/code
2. Connect GitHub and select this repository
3. Start a task
4. Setup runs automatically via sessionStart hook
5. Claude has full project context from CLAUDE.md

### On Claude Code CLI
1. Open this repository in your terminal
2. Run `claude` command
3. Setup runs automatically via sessionStart hook
4. Claude has full project context from CLAUDE.md

### Manual Setup
To run the setup script manually:
```bash
./scripts/setup.sh
```

## Personal Customization

Create `.claude/settings.local.json` for personal overrides:
```json
{
  "model": {
    "default": "opus"
  },
  "hooks": {
    "toolUseStart": "echo 'Starting tool...'"
  }
}
```

Create `CLAUDE.local.md` for personal instructions (overrides CLAUDE.md):
```markdown
# My Personal Preferences

- Always use verbose logging
- Run tests before any commit
- Prefer functional programming patterns
```

Both files are git-ignored and won't be shared with the team.

## Documentation

- **Claude Code Docs:** https://docs.claude.com/en/docs/claude-code
- **Settings Reference:** https://docs.claude.com/en/docs/claude-code/settings.md
- **Memory & Imports:** https://docs.claude.com/en/docs/claude-code/memory.md
- **Hooks Reference:** https://docs.claude.com/en/docs/claude-code/hooks.md

## Updating Configuration

### To update team settings:
1. Edit `.claude/settings.json`
2. Commit and push changes
3. Team members get updates on next pull

### To update project context:
1. Edit `AGENTS.md` with architecture changes
2. Commit and push changes
3. Claude will have updated context in next session

### To update setup script:
1. Edit `scripts/setup.sh`
2. Test locally: `./scripts/setup.sh`
3. Commit and push changes
4. Runs automatically on next Claude Code session start
