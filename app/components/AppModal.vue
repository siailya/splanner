<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-backdrop" role="presentation" @mousedown.self="$emit('close')">
        <section class="app-modal" :class="{ 'app-modal--wide': wide }" role="dialog" aria-modal="true" :aria-labelledby="titleId">
          <header class="app-modal__header">
            <div>
              <span v-if="eyebrow" class="app-modal__eyebrow">{{ eyebrow }}</span>
              <h2 :id="titleId">{{ title }}</h2>
              <p v-if="description">{{ description }}</p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Закрыть" @click="$emit('close')" />
          </header>
          <div class="app-modal__body"><slot /></div>
          <footer v-if="$slots.footer" class="app-modal__footer"><slot name="footer" /></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ open: boolean; title: string; description?: string; eyebrow?: string; wide?: boolean }>()
defineEmits<{ close: [] }>()
const titleId = useId()
</script>
