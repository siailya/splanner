<template>
  <div class="markdown-editor">
    <div class="markdown-editor__header">
      <div class="segmented segmented--compact">
        <button type="button" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">Редактор</button>
        <button type="button" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Preview</button>
      </div>
      <span>Markdown · unsafe HTML отключён</span>
    </div>
    <UEditor
      v-if="mode === 'edit'"
      v-slot="{ editor }"
      v-model="value"
      content-type="markdown"
      placeholder="Добавьте контекст, критерии готовности, ссылки…"
      class="markdown-editor__surface"
    >
      <UEditorToolbar :editor="editor" :items="toolbar" layout="fixed" class="markdown-editor__toolbar" />
    </UEditor>
    <div v-else class="markdown-preview" v-html="preview" />
  </div>
</template>

<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'
import { renderSafeMarkdown } from '../utils/markdown'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const mode = ref<'edit' | 'preview'>('edit')
const value = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const preview = computed(() => renderSafeMarkdown(props.modelValue))
const toolbar: EditorToolbarItem[][] = [[
  { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', tooltip: { text: 'Заголовок' } },
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Жирный' } },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Курсив' } },
  { kind: 'mark', mark: 'code', icon: 'i-lucide-code', tooltip: { text: 'Код' } },
  { kind: 'bulletList', icon: 'i-lucide-list', tooltip: { text: 'Список' } },
  { kind: 'orderedList', icon: 'i-lucide-list-ordered', tooltip: { text: 'Нумерованный список' } },
  { kind: 'blockquote', icon: 'i-lucide-quote', tooltip: { text: 'Цитата' } },
  { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Ссылка' } },
]]
</script>
