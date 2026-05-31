---
name: JobStore DB Persistence
description: How job_store.py persists background jobs to PostgreSQL, and the psycopg2 quirks involved.
---

## Architecture
- `background_jobs` table (TEXT columns, not JSONB) — auto-created by `JobStore.__init__()` on startup.
- In-memory cache (10s TTL) for fast poll reads; DB is authoritative on cache miss.
- Raw psycopg2 connections via `engine.raw_connection()` — NOT SQLAlchemy ORM or `text()`.

## Critical quirks

### 1. SQLAlchemy text() + ::jsonb breaks psycopg2
Mixing named params `%(x)s` with Postgres cast `::jsonb` inside `text()` causes a `SyntaxError`.
**Fix:** Store `result` as a plain `TEXT` column (JSON string). psycopg2 handles the serialization.

### 2. psycopg2 auto-parses JSON TEXT columns
When a TEXT column contains a JSON string and psycopg2 fetches it, it may return a Python `dict`/`list` instead of a `str`. `json.loads()` on a dict raises `TypeError`.
**Fix:** `_db_read()` checks `isinstance(r_result, (dict, list))` first; only calls `json.loads()` on `str`.

**Why:** These were silent failures — `_db_write()` swallowed exceptions with `logger.debug`, so jobs appeared to work in-memory but weren't persisted.

**How to apply:** Any future DB-backed store using psycopg2 raw connections must handle both cases for JSON fields.
