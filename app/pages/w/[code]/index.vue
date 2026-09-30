<script setup lang="ts">
definePageMeta({ layout: false })
const route = useRoute()
await navigateTo(`/w/${encodeURIComponent(String(route.params.code))}/view/timeline`, { replace: true })
</script>
