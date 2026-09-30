export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/' || to.path.startsWith('/w/')) {
    if (to.params.mode && !['view', 'edit'].includes(String(to.params.mode))) return navigateTo('/')
    return
  }
  return navigateTo('/')
})
