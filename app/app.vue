<template>
  <UApp>
    <NuxtErrorBoundary @error="handleError">
      <NuxtLayout>
        <NuxtPage :page-key="route => `${String(route.name)}:${String(route.params.code || '')}:${String(route.params.mode || '')}`" />
      </NuxtLayout>

      <template #error="{ error, clearError }">
        <div class="fatal-error">
          <div class="fatal-error__card">
            <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
            <h1>Не удалось открыть план</h1>
            <p>{{ error.message }}</p>
            <UButton label="Попробовать снова" @click="clearError" />
          </div>
        </div>
      </template>
    </NuxtErrorBoundary>
  </UApp>
</template>

<script setup lang="ts">
const toast = useToast()

function handleError(error: unknown) {
  console.error(error)
  toast.add({
    title: 'Ошибка приложения',
    description: error instanceof Error ? error.message : 'Неизвестная ошибка',
    color: 'error',
  })
}
</script>
