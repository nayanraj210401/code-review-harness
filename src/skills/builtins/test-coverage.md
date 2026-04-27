---
id: test-coverage
name: Test Coverage Reviewer
description: Reviews test quality, identifies missing test cases, edge cases, and untested code paths
triggers: [test, spec, jest, mocha, vitest, describe, it, expect, assert, mock, stub, coverage, unit, integration]
mode: inline
version: "1.0"
author: crh-builtins
---

## Test Coverage Review

Review the changes for test completeness:

**Missing test cases:**
- Is the new code covered by tests?
- Are error paths and exceptions tested?
- Are edge cases covered: empty input, null/undefined, boundary values, very large inputs?

**Test quality issues:**
- Are tests asserting the right things, or just asserting they run without error?
- Are mocks hiding real behavior (mock the boundary, not the implementation)?
- Are tests isolated or do they depend on shared mutable state?
- Are async tests properly awaited?

**Missing integration tests:**
- For database operations: is there an integration test or only a unit test with a mock?
- For API endpoints: is the full request/response cycle tested?

**Test naming:**
- Do test names clearly describe what is being tested and what the expected outcome is?

**Setup/teardown issues:**
- Is test state properly cleaned up between tests?
- Could test ordering affect results?

Rate the test coverage as a finding with severity based on risk:
- `critical`: Security or payment code with no tests
- `high`: Core business logic untested
- `medium`: Utility functions or helpers untested
- `low`: Edge cases missing in otherwise-covered code
- `info`: Minor test quality improvements
