# Performance report

Целевой fixture: 30 epics, 500 stages, 1 500 links, assignments на два квартала.

Автоматические budgets:

- scheduling cascade: `< 100 ms`;
- capacity recompute: `< 150 ms`.

Запуск: `bun run test:performance`. На release-прогоне 2026-07-23 оба теста прошли. DHTMLX spike зафиксирован в ADR-0001: smart rendering оставляет в DOM только видимые строки, а frame interval имеет запас относительно 45 FPS.

PNG заранее считает canvas dimensions и отклоняет размер выше 16 384 px по стороне или 60 MP. Full workspace import валидируется в памяти до транзакции.

Build предупреждает о крупных lazy chunks DHTMLX/Nuxt UI. Gantt загружается client-only dynamic import и не входит в Table/Settings critical interaction path.
