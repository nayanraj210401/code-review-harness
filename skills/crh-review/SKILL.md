---
name: crh-review
description: Run a multi-agent AI code review using the code-review-harness (crh) CLI. Use when asked to review code, before committing, or when checking for bugs, security issues, or performance problems. Invokes multiple expert AI agents in parallel across different models and returns structured findings.
allowed-tools: Bash
---

# Code Review Harness (crh) Skill

This skill uses the `crh` CLI to run a multi-agent code review. Multiple expert AI agents (Security, Performance, Architecture, Correctness, Testing) review the code in parallel — each from a different perspective — and a dynamic router selects the most relevant experts based on what the diff actually contains.

---

## Step 1 — Check crh is installed

```bash
which crh
```

If not found, install it:
```bash
npm install -g review-harness
```

Then run the first-time setup if no config exists:
```bash
crh init
```

---

## Step 2 — Determine what to review

Use the appropriate command based on the situation:

**Review uncommitted staged changes:**
```bash
crh review --diff-args "HEAD" --staged --level standard --format json --no-color
```

**Review the last commit (default):**
```bash
crh review --diff-args "HEAD~1 HEAD" --level standard --format json --no-color
```

**Review a specific range (e.g. a feature branch vs main):**
```bash
crh review --diff-args "main HEAD" --level standard --format json --no-color
```

**Review specific files:**
```bash
crh review --files "src/auth.ts,src/payments.ts" --level standard --format json --no-color
```

**Pipe a diff directly:**
```bash
git diff HEAD~1 HEAD | crh review --level standard --format json --no-color
```

---

## Step 3 — Choose the review level

| Level    | When to use                                      | Agents  | Speed    |
|----------|--------------------------------------------------|---------|----------|
| `quick`  | Pre-commit sanity check, small changes           | 2       | < 30s    |
| `standard` | Normal PR review, feature branch               | up to 5 | 30s–2min |
| `deep`   | Security-sensitive code, architecture changes   | all 7   | 2–10min  |

For council mode (agents critique each other before synthesis):
```bash
crh review --level standard --council --format json --no-color
```

---

## Step 4 — Parse and present the output

The `--format json` flag returns a `ReviewSession` object. Key fields to surface:

```
session.findings[]         — array of findings, sorted by severity
session.routerDecision     — which agents were selected and why
session.summary            — one-line summary
session.totalTokensUsed    — cost indicator
session.durationMs         — how long it took
```

Each finding has:
```
finding.severity           — critical | high | medium | low | info
finding.category           — security | performance | architecture | correctness | testing
finding.title              — short name
finding.description        — what the issue is
finding.suggestion         — how to fix it
finding.filePath           — file (if known)
finding.lineStart          — line number (if known)
finding.confidence         — 0.0–1.0
finding.skillId            — which skill surfaced it (e.g. owasp-top10)
```

Present findings grouped by severity. For `critical` and `high`, always show the suggestion inline. For `medium` and below, summarize unless the user asks for detail.

---

## Step 5 — Follow-up actions

After presenting findings:

- If there are `critical` findings: block proceeding, explain the risk clearly
- If there are `high` findings: recommend fixing before merging, show the suggestion
- Offer to fix specific findings inline if the user agrees
- If the user wants to dig deeper on a specific finding, run with `--level deep --agents <relevant-agent-id>`

---

## Additional commands

**See which agents are available:**
```bash
crh agents list
```

**See which skills are active:**
```bash
crh skills list
```

**Search past reviews:**
```bash
crh history --search "sql injection" --limit 5
```

**Run a council review (agents deliberate and reach consensus):**
```bash
crh council --members security,performance,architecture --level standard --format json --no-color
```

---

## MCP integration (preferred for ongoing use)

If crh is configured as an MCP server in `~/.claude/settings.json`, all the above is available as direct tool calls without bash subprocess overhead:

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

When MCP is active, prefer calling `crh_review` directly instead of using Bash.

---

## Quick reference

| Task | Command |
|------|---------|
| Review last commit | `crh review --diff-args "HEAD~1 HEAD" --level standard --format json` |
| Review staged only | `crh review --diff-args "HEAD" --staged --level quick --format json` |
| Security focus | `crh review --agents security --skills owasp-top10,sql-injection --level deep` |
| Council review | `crh council --members security,performance,architecture --format json` |
| Save to file | `crh review --format markdown --output review.md` |
| SARIF for IDE | `crh review --format sarif --output report.sarif.json` |
