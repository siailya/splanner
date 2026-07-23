# Compatibility matrix

| Среда | Результат |
|---|---|
| Chromium / desktop macOS | Playwright E2E passed |
| WebKit (Safari engine) / desktop macOS | Playwright E2E passed |
| Edge | Chromium-compatible; release smoke требуется на Windows target |
| Safari macOS | WebKit E2E + ordinary download path without File System Access |
| Firefox / desktop macOS | Playwright E2E passed |
| Width < 1280 px | Явное предупреждение, редактирование скрыто |

Keyboard paths покрывают toolbar/forms, drawer alternatives существуют для drag/link operations, focus styles видимы, overload имеет текст/иконку. Цвет не является единственным индикатором blocked/conflict/overload.

Перед распространением Windows-сборки выполните checklist на реальном Edge/Chrome Windows: drag, resize, native download, print preview и keyboard modifiers.
