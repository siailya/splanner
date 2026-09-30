export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  nitro: {
    preset: 'static',
  },
  vite: {
    server: { proxy: { '/api': { target: 'http://127.0.0.1:3101', changeOrigin: true } } },
    optimizeDeps: {
      include: [
        'dhtmlx-gantt', 'dexie',
        '@nuxt/ui > prosemirror-state', '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model', '@nuxt/ui > prosemirror-view', '@nuxt/ui > prosemirror-gapcursor',
      ],
    },
  },
  hooks: {
    'pages:extend'(pages) {
      for (const page of [...pages]) {
        if (page.path === '/' || page.path.startsWith('/w/')) continue
        pages.push({ ...page, name: `workspace-${page.name}`, path: `/w/:code/:mode${page.path}` })
      }
    },
  },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@vueuse/nuxt'],
  ui: {
    fonts: false,
  },
  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
      icons: [
        'lucide:gantt-chart', 'lucide:table-2', 'lucide:folder-kanban', 'lucide:users',
        'lucide:settings-2', 'lucide:hard-drive', 'lucide:cloud-check', 'lucide:cloud-alert',
        'lucide:loader-circle', 'lucide:sun', 'lucide:moon',
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Delivery Planner',
      htmlAttrs: { lang: 'ru' },
      meta: [
        { name: 'description', content: 'Сетевой delivery-план с Gantt-таймлайном' },
        { name: 'color-scheme', content: 'light dark' },
      ],
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
})
