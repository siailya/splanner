<template>
  <textarea
    v-if="!readOnly"
    class="plain-description"
    :value="modelValue"
    rows="6"
    aria-label="Описание"
    placeholder="Добавьте описание…"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
  <p v-else class="plain-description plain-description--read-only">{{ modelValue || 'Описание пока не добавлено.' }}</p>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string; readOnly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
