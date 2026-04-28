# code-review-harness (`crh`)

A CLI tool that catches bugs early by spinning up multiple AI expert sub-agents — each from a different model — to review your code in parallel. A lightweight router analyzes your diff first and picks the most relevant experts, so you're never running a security agent on a CSS change.

```
crh review --level standard --format pretty
```

---

## How it works

```
git diff → DiffSummary (file list, languages, tokens)
                ↓
           Router (fast model) → selects agents, suggests skill hints
                ↓
   Security  Performance  Architecture  Correctness  Testing
   (claude)  (gpt-4o)     (gemini)     (claude)     (claude)
       ↓           ↓            ↓
   request_skill?  synthesize_skill?   ... each agent decides at runtime
                ↓
          findings deduplicated + sorted
                ↓
     pretty / markdown / json / sarif
```

**Agent = Model + Harness.** The harness handles routing, skills, state, tools, and output. The models do the thinking.

Three key ideas:

- **Agents are data files, not code.** Each expert is a `.md` file with a YAML frontmatter + system prompt. Drop one in `~/.crh/agents/` to create a new expert — no compilation needed.
- **Structured diff routing.** The router receives a compact `DiffSummary` (file list, languages, key tokens) rather than the raw diff — so routing stays fast and accurate regardless of how large the PR is.
- **Skills loaded at runtime by agents.** Agents see the full skill catalog as metadata in their system prompt and decide mid-review which skills to pull in. Calling `request_skill` injects the full checklist into the live conversation. Agents can also call `synthesize_skill` to write an ephemeral checklist for a domain the catalog doesn't cover.

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

# Council mode — same agent, multiple model families deliberate
crh council --agent security --models anthropic/claude-opus-4-5,openai/gpt-4o,google/gemini-2.5-pro-preview

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

Skills are domain checklists agents can load at runtime. Each agent sees the full catalog as metadata and calls `request_skill` to fetch content on demand — nothing is pre-loaded.

| Skill | Description |
|---|---|
| `owasp-top10` | OWASP Top 10 web vulnerability checklist |
| `sql-injection` | Raw query patterns, ORM misuse, NoSQL injection |
| `big-o-analysis` | Algorithmic complexity, N+1, data structure misuse |
| `test-coverage` | Missing tests, edge cases, async test pitfalls |
| `api-design` | REST conventions, status codes, pagination, auth |
| `dependency-audit` | New packages, version pinning, license, supply chain |

Agents can also call `synthesize_skill` to create an ephemeral checklist on-the-fly for domains not covered above (e.g. Solidity, GraphQL schemas, internal conventions).

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

Council mode runs **one agent role across multiple model families**. The key insight: different model families (Claude, GPT-4o, Gemini) have genuinely different training and biases, so disagreement between them is real signal. Same-model-family instances tend to agree with each other — which defeats the purpose.

Three stages:
1. **Independent review** — each model runs the same agent prompt against the diff, in parallel
2. **Peer critique** — each model critiques the others' findings; because they share expertise, disagreement is meaningful
3. **Synthesis** — a chair model surfaces consensus findings with an agreement score (e.g. 2/3 models flagged this)

```bash
# Security review: three model families deliberate
crh council --agent security --models anthropic/claude-opus-4-5,openai/gpt-4o,google/gemini-2.5-pro-preview

# Architecture review with just two models
crh council --agent architecture --models anthropic/claude-opus-4-5,openai/gpt-4o --level deep

# Output to markdown
crh council --agent correctness --models anthropic/claude-opus-4-5,openai/gpt-4o --format markdown
```

Findings with a high agreement score (all models agree) are surfaced first. Findings raised by only one model are flagged as outliers for human judgement.

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

## GitHub Actions

A ready-to-use workflow is included at `.github/workflows/code-review.yml`. It runs on every pull request, builds `crh` from source, and reviews the PR diff:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

The workflow uses `node bin/crh.js` directly (no global install required) and exits with code `1` if any `high` or `critical` finding is found, blocking the merge.

**Setup:**
1. Add `OPENROUTER_API_KEY` to your repo's **Settings → Secrets and variables → Actions**.
2. The workflow is active — no further configuration needed.

Change the severity threshold with `--fail-on`:

```yaml
run: node bin/crh.js review ... --fail-on critical   # only block on critical
```

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
    "defaultAgent": "security",
    "defaultModels": [
      "anthropic/claude-opus-4-5",
      "openai/gpt-4o",
      "google/gemini-2.5-pro-preview"
    ],
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

To run without writing a history file (CI, one-shot use), set `dbPath` to `:memory:`:

```json
{ "dbPath": ":memory:" }
```

The in-memory database is fully functional for the duration of the process — caching, deduplication, and session tracking all work — but nothing is written to disk.

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
