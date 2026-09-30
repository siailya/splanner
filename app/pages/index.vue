<template>
  <div class="workspace-entry">
    <div class="brand__mark">DP</div>
    <h1>Открыть workspace</h1>
    <p>Введите код, полученный от администратора.</p>
    <form @submit.prevent="openWorkspace">
      <input v-model="code" autocomplete="off" spellcheck="false" maxlength="16" placeholder="Код workspace" aria-label="Код workspace">
      <UButton type="submit" label="Открыть" :disabled="!validCode" />
    </form>
  </div>
</template>
<script setup lang="ts">
definePageMeta({ layout: false })
const code = ref('')
const validCode = computed(() => /^[a-z2-7]{16}$/i.test(code.value.trim()))
function openWorkspace() { if (validCode.value) navigateTo(`/w/${code.value.trim().toLowerCase()}/view/timeline`) }
</script>
