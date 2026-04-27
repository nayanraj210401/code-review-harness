---
id: sql-injection
name: SQL Injection Detector
description: Deeply checks for SQL injection risks including raw queries, ORMs misuse, NoSQL injections, and second-order injections
triggers: [sql, query, database, db, select, insert, update, delete, where, join, mongoose, prisma, sequelize, knex, raw, execute]
mode: inline
version: "1.0"
author: crh-builtins
---

## SQL Injection Detection Guide

Look specifically for these patterns:

**Direct string interpolation in queries:**
```
"SELECT * FROM users WHERE id = " + userId    // VULNERABLE
db.query(`SELECT * FROM users WHERE id = ${req.params.id}`)  // VULNERABLE
```

**ORM raw query misuse:**
```
Model.findAll({ where: sequelize.literal(`name = '${input}'`) })  // VULNERABLE
db.query("SELECT * FROM t WHERE x = " + val)  // VULNERABLE
```

**Safe patterns to verify:**
```
db.query("SELECT * FROM users WHERE id = ?", [userId])  // SAFE
Model.findByPk(userId)  // SAFE
prisma.user.findUnique({ where: { id: userId } })  // SAFE
```

**NoSQL injection (MongoDB):**
```
db.collection.find({ username: req.body.username })  // may be VULNERABLE if username is an object like { $gt: "" }
// Safe: validate and sanitize input before passing to MongoDB
```

**Second-order injection:** Check if data is stored unescaped and used later in a query.

**LIKE clause injection:** `LIKE '%' + input + '%'` — still injectable.

For each finding, specify the exact file and line, the vulnerable pattern, and the safe replacement.
