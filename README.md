# code-review-harness (`crh`)

A CLI tool that catches bugs early by spinning up multiple AI expert sub-agents — each from a different model — to review your code in parallel. A lightweight router analyzes your diff first and picks the most relevant experts, so you're never running a security agent on a CSS change.

```
crh review --level standard --format pretty
```

---

## How it works

```
git diff → Router (fast model) → selects relevant agents + skills
                                        ↓
                    Security  Performance  Architecture  Correctness  Testing
                    (claude)  (gpt-4o)     (gemini)     (claude)     (claude)
                                        ↓
                              findings deduplicated + sorted
                                        ↓
                         pretty / markdown / json / sarif
```

**Agent = Model + Harness.** The harness handles routing, skills, state, tools, and output. The models do the thinking.

Three key ideas:

- **Agents are data files, not code.** Each expert is a `.md` file with a YAML frontmatter + system prompt. Drop one in `~/.crh/agents/` to create a new expert — no compilation needed.
- **Dynamic routing.** A cheap router model reads your diff and the full agent catalog, then picks the best agents for the job. Review level (`quick` / `standard` / `deep`) caps the budget, not the selection.
- **Skills = progressive disclosure.** Skills are reusable prompt bundles (OWASP checklist, N+1 detector, etc.) Only their name and description are loaded upfront; full content is fetched lazily when selected.

---

## Install

```bash
npm install -g review-harness
crh init
```

`crh init` runs an interactive wizard to choose your provider and configure agents.

Or run without installing:

```bash
npx review-harness init
```

---

## Providers

| Provider | How | Needs |
|---|---|---|
| **OpenRouter** | HTTP API — access to all models | `OPENROUTER_API_KEY` |
| **Claude CLI** | Spawns your local `claude` process | Claude Code installed + logged in |
| **Codex CLI** | Spawns your local `codex` process | Codex CLI installed + logged in |

Select during `crh init` or set in `~/.crh/config.json`.

---

## Commands

```bash
# Standard review of last commit
crh review

# Quick pre-commit check on staged changes
crh review --diff-args "HEAD --staged" --level quick

# Deep review of a feature branch
crh review --diff-args "main HEAD" --level deep

# Target specific agents and skills
crh review --agents security,correctness --skills owasp-top10,sql-injection

# Council mode — agents deliberate and reach consensus
crh council --members security,performance,architecture --level standard

# Output formats
crh review --format markdown --output review.md
crh review --format sarif --output report.sarif.json   # IDE / GitHub integration

# Browse history
crh history --search "sql injection"

# Explore catalog
crh agents list
crh skills list

# Install a custom skill
crh skills install ./my-skill.md

# Run as MCP server (for Claude Code)
crh serve --mcp
```

---

## Review levels

| | `quick` | `standard` | `deep` |
|---|---|---|---|
| Target latency | < 30s | 30s – 2min | 2 – 10min |
| Max agents | 2 (router picks) | 5 (router picks) | all relevant |
| Ephemeral agents | ✗ | ✗ | ✓ router synthesizes new experts |
| Skills | inline | inline | inline + subagent |
| Council mode | ✗ | optional | optional |
| Fail threshold | critical | high | medium |

Exit code `0` = no findings above threshold. `1` = findings found. `2` = error. Override with `--fail-on`.

---

## Built-in agents

| Agent | Focus | Default model |
|---|---|---|
| `security` | Auth, injection, OWASP, secrets | claude-opus-4-5 |
| `performance` | N+1 queries, O(n²), memory leaks | gpt-4o |
| `architecture` | SOLID, coupling, layering, patterns | gemini-2.5-pro |
| `correctness` | Logic bugs, null deref, race conditions | claude-opus-4-5 |
| `testing` | Coverage gaps, bad mocks, brittle tests | claude-opus-4-5 |
| `style` | Naming, readability, DRY *(disabled by default)* | gpt-4o-mini |
| `documentation` | JSDoc, changelogs, public API docs *(disabled)* | gpt-4o-mini |

Each agent's model can be overridden per-agent in `~/.crh/config.json`.

---

## Built-in skills

Skills are domain checklists injected into the relevant agent's context.

| Skill | Description |
|---|---|
| `owasp-top10` | OWASP Top 10 web vulnerability checklist |
| `sql-injection` | Raw query patterns, ORM misuse, NoSQL injection |
| `big-o-analysis` | Algorithmic complexity, N+1, data structure misuse |
| `test-coverage` | Missing tests, edge cases, async test pitfalls |
| `api-design` | REST conventions, status codes, pagination, auth |
| `dependency-audit` | New packages, version pinning, license, supply chain |

---

## Adding a custom agent

No code required — create a `.md` file:

```markdown
---
id: rust-expert
name: Rust Safety Expert
description: Checks Rust code for unsafe usage, lifetime issues, and concurrency bugs
triggers: [unsafe, lifetime, Arc, Mutex, async, await, tokio]
model: anthropic/claude-opus-4-5
temperature: 0.1
reviewLevels: [standard, deep]
allowedTools: [git-diff, file-reader]
builtinSkills: []
---

You are a Rust expert. Review the changes for unsafe blocks, lifetime violations,
and concurrency bugs. Flag any use of `unsafe` without justification...
```

Drop it in `~/.crh/agents/` — immediately available:

```bash
crh agents list
crh review --agents rust-expert --level standard
```

Same format for project-specific agents in `.crh/agents/` at the repo root.

---

## Adding a custom skill

```markdown
---
id: my-checklist
name: My Team Checklist
description: Internal code standards checklist
triggers: [service, controller, handler]
mode: inline
---

Always check:
- Feature flags are cleaned up
- Metrics are emitted for new endpoints
...
```

```bash
crh skills install ./my-checklist.md
```

---

## Council mode

In council mode, agents deliberate before producing a final answer:

1. **Individual review** — each agent reviews the diff independently
2. **Peer critique** — agents rank each other's findings anonymously
3. **Synthesis** — a chair model (default: claude-opus-4-5) computes consensus, surfaces high-agreement findings

```bash
crh council --members security,performance,architecture --level standard --format markdown
```

---

## Claude Code integration (MCP)

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "review-harness": {
      "command": "crh",
      "args": ["serve", "--mcp"]
    }
  }
}
```

Claude Code can then call `crh_review`, `crh_history`, `crh_agents_list`, and `crh_skills_list` directly as tools.

A Claude Code skill is included in `skills/crh-review/SKILL.md`. Install it:

```bash
mkdir -p ~/.claude/skills/crh-review
cp skills/crh-review/SKILL.md ~/.claude/skills/crh-review/SKILL.md
```

Then invoke with `/crh-review` or let Claude auto-trigger it when you ask for a code review.

---

## Configuration

Config file: `~/.crh/config.json` (created by `crh init`)

```json
{
  "defaultProvider": "openrouter",
  "defaultLevel": "standard",
  "defaultFormat": "pretty",
  "router": { "model": "openai/gpt-4o-mini", "enabled": true },
  "providers": {
    "openrouter": {
      "apiKey": "${OPENROUTER_API_KEY}",
      "defaultModel": "anthropic/claude-opus-4-5"
    }
  },
  "agents": {
    "security": { "enabled": true, "model": "anthropic/claude-opus-4-5" }
  },
  "councilMode": {
    "enabled": false,
    "defaultMembers": ["security", "performance", "architecture"],
    "chairModel": "anthropic/claude-opus-4-5"
  }
}
```

Config precedence: CLI flags → env vars (`CRH_DEFAULT_LEVEL`, `CRH_DEFAULT_PROVIDER`) → `~/.crh/config.json` → defaults.

---

## Review history

Every review is persisted to `~/.crh/reviews.db` (SQLite + FTS5):

```bash
crh history                          # last 10 reviews
crh history --search "null pointer"  # full-text search
crh history --json                   # machine-readable
```

---

## Programmatic use

```typescript
import { createReviewHarness } from "review-harness";

const session = await createReviewHarness({
  defaultProvider: "openrouter",
  defaultLevel: "standard",
}).review({
  diffArgs: ["HEAD~1", "HEAD"],
  format: "json",
});

console.log(session.findings);
```

---

## Extending crh

| What | How |
|---|---|
| New agent persona | `.md` file in `~/.crh/agents/` |
| New skill | `.md` file in `~/.crh/skills/` |
| New provider | Implement `IProvider`, register in `src/providers/registry.ts` |
| New context tool | Implement `IContextTool`, register in `src/tools/registry.ts` |
| New formatter | Implement `IFormatter`, register in `src/formatters/registry.ts` |
| Project-specific agent | `.crh/agents/*.md` in the repo root |

---

## License

MIT
