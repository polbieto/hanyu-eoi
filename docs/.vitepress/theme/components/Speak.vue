<script setup lang="ts">
import { useSpeech } from '../composables/useSpeech'

interface Props {
  text: string
  rate?: number
  pitch?: number
}

const props = withDefaults(defineProps<Props>(), {
  rate: 0.9,
  pitch: 1.0
})

const { isSupported, isSpeaking, speak } = useSpeech()

function handleSpeak() {
  speak(props.text, props.rate, props.pitch)
}
</script>

<template>
  <button
    v-if="isSupported"
    type="button"
    class="vp-speak-btn"
    :class="{ 'is-speaking': isSpeaking }"
    :title="`Escuchar pronunciación: ${text}`"
    :aria-label="`Escuchar pronunciación en chino de ${text}`"
    @click.stop="handleSpeak"
  >
    <span class="vp-speak-icon" aria-hidden="true">🔊</span>
  </button>
</template>

<style scoped>
.vp-speak-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 0.35em;
  padding: 0.1rem 0.4rem;
  font-size: 0.8em;
  line-height: 1.2;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.1s ease;
}

.vp-speak-btn:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-speak-btn:active {
  transform: scale(0.94);
}

.vp-speak-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-speak-btn.is-speaking {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-speak-icon {
  display: inline-block;
  line-height: 1;
}
</style>
