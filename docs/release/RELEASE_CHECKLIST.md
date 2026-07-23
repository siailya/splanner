# Release checklist 1.0.0

- [x] TypeScript strict: `bun run typecheck`
- [x] ESLint Vue/TypeScript: `bun run lint`
- [x] Unit/property/persistence: `bun run test`
- [x] 500-stage performance: `bun run test:performance`
- [x] Chromium + Firefox + WebKit E2E: `bun run test:e2e`
- [x] Static generation: `bun run generate`
- [x] Schema v2→v3 migration test
- [x] Full/quarter export and invalid import tests
- [x] Backup create/restore browser scenario
- [x] Baseline overlay and Table synchronization browser scenario
- [x] No remote DHTMLX font/export API
- [x] User, backup, migration, troubleshooting and architecture docs
- [ ] Manual Chrome/Edge smoke on Windows target
- [ ] Manual Safari print dialog smoke on target macOS release version

Release artifact: `.output/public`. Host as static files; SPA fallback must route unknown paths to `index.html`.
