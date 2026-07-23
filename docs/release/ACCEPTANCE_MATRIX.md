# MVP acceptance matrix

| AC | Статус | Evidence |
|---|---|---|
| 001–004 | Pass | Timeline forms/Gantt; calendar + scheduling unit/E2E |
| 005–008 | Pass | scheduling unit/property tests: cascade/free/cycle/parallel |
| 009–011 | Pass | capacity unit/performance; panel drill-down/highlight |
| 012–013 | Pass | sanitized Markdown; epic/stage work items and grouping |
| 014 | Pass | baseline domain test + Chromium/WebKit overlay E2E |
| 015 | Pass | history atomic snapshot test, limit 100 |
| 016 | Pass | IndexedDB reload E2E |
| 017–018 | Pass | JSON round-trip/invalid transaction tests |
| 019 | Pass | rolling before-import backup + restore E2E |
| 020 | Pass | 500/1 500 performance suites |
| 021 | Pass | current/next/combined/archive, canonical quarterIds |
| 022 | Pass | Canvas PNG and print route; no export server |

## Functional groups

- FR-WS/EP/ST/TX: implemented in Timeline, Projects, Table and Settings.
- FR-DP/CL: pure TypeScript calendar/DAG engine, drawer/link UI, Cascade ghost preview, repair/compact.
- FR-RS/CP: roles, people, person/role demand, day/week panel, filters and drill-down.
- FR-BL/TB/FL/UR: named immutable baselines, variance/new/removed, table, persisted filters, 100-command history.
- FR-DT: Dexie transactions, rolling snapshots, v1–v3 validation/migration, full/quarter export, Replace import, PNG/print, persistent storage and recovery.

Automated release commands are listed in `RELEASE_CHECKLIST.md`. The browser suite covers Chromium, Firefox and WebKit engines. Platform-specific Windows manual smoke remains an explicit distribution step because the development host is macOS.
