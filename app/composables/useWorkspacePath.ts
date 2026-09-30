export function useWorkspacePath() {
  const route = useRoute()
  return (path: string, mode?: 'view' | 'edit') => {
    const code = String(route.params.code || '')
    if (!code) return '/'
    const currentMode = mode || (route.params.mode === 'edit' ? 'edit' : 'view')
    return `/w/${encodeURIComponent(code)}/${currentMode}${path.startsWith('/') ? path : `/${path}`}`
  }
}
