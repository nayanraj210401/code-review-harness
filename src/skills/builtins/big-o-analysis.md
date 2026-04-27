---
id: big-o-analysis
name: Algorithmic Complexity Analyzer
description: Identifies inefficient algorithms, nested loops, N+1 query patterns, and suggests better time/space complexity
triggers: [loop, for, while, map, filter, reduce, sort, find, index, array, list, query, fetch, database, O(n), performance, cache]
mode: inline
version: "1.0"
author: crh-builtins
---

## Algorithmic Complexity Review

Analyze the code for computational inefficiencies:

**Nested loop patterns (O(n²) or worse):**
- Double nested loops over the same or related collections
- Using `.find()` or `.filter()` inside a loop (O(n²))
- Sorting inside a loop (O(n² log n))

**N+1 query problem:**
- Fetching a list of items, then querying each one individually in a loop
- ORM lazy loading inside loops
- `for (const item of items) { await db.find(item.id) }` — should be a single batched query

**Unnecessary re-computation:**
- Calling `.length`, `.size`, or expensive getters inside loop conditions
- Re-sorting or re-filtering the same collection multiple times

**Data structure misuse:**
- Using an Array where a Set would give O(1) lookup instead of O(n)
- Using an Array where a Map would avoid repeated `.find()` calls

**Memory inefficiency:**
- Creating large intermediate arrays when a single pass would do
- Keeping large objects in memory longer than necessary

For each finding: estimate the current vs. possible complexity (e.g., "O(n²) → O(n log n)"), explain the impact at scale, and suggest the specific refactor.
