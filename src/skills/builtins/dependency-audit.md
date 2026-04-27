---
id: dependency-audit
name: Dependency Vulnerability Auditor
description: Reviews dependency changes for known vulnerabilities, license issues, and supply chain risks
triggers: [package.json, requirements.txt, Gemfile, go.mod, Cargo.toml, dependency, import, require, install, npm, yarn, pip, cargo, gem, module, version, upgrade, bump]
mode: inline
version: "1.0"
author: crh-builtins
---

## Dependency Audit Review

When the diff includes changes to dependency files (package.json, requirements.txt, etc.):

**Version pinning:**
- Are new dependencies pinned to exact versions or using loose ranges (^, ~, *)?
- Loose ranges can introduce breaking changes or vulnerabilities on reinstall.

**New dependencies:**
- Is the added package well-maintained (recent commits, active maintainers)?
- Does the package have a history of security issues?
- Is the package necessary, or could the functionality be implemented without it?
- How large is the package? Does it bring a large transitive dependency tree?

**Removed dependencies:**
- Is the removal complete? Are there still references in the code?

**Upgrade considerations:**
- Does the version bump include breaking changes per the changelog/semver?
- Is the upgrade tested?

**Supply chain risks:**
- Is this a typosquat of a popular package? (e.g., `coloers` vs `colors`)
- Does the package request unusual permissions or make network calls during install?
- Is the package from a trusted publisher?

**License compatibility:**
- Does the new dependency use a compatible license (MIT, Apache 2.0 are generally safe; GPL may require open-sourcing your code)?

Flag any additions that appear risky as `high` or `critical` severity findings.
