<script setup lang="ts">
import { computed } from 'vue'
import { useSpeech } from '../composables/useSpeech'
import { hasHanzi, openStrokeModal } from '../composables/useStrokeModal'

interface Props {
  text: string
  writeText?: string
  rate?: number
  pitch?: number
}

const props = withDefaults(defineProps<Props>(), {
  writeText: undefined,
  rate: 0.9,
  pitch: 1.0
})

const { isSupported, isSpeaking, speak } = useSpeech()

const targetWriteText = computed(() => props.writeText ?? props.text)
const canWrite = computed(() => hasHanzi(targetWriteText.value))

function handleSpeak() {
  speak(props.text, props.rate, props.pitch)
}

function handleWrite() {
  openStrokeModal(targetWriteText.value, { initialMode: 'quiz' })
}
</script>

<template>
  <span v-if="isSupported || canWrite" class="vp-speak-group">
    <button
      v-if="isSupported"
      type="button"
      class="vp-speak-btn"
      :class="{ 'is-speaking': isSpeaking }"
      :title="isSpeaking ? 'Detener audio' : `Escuchar pronunciación: ${text}`"
      :aria-label="
        isSpeaking
          ? 'Detener pronunciación'
          : `Escuchar pronunciación en chino de ${text}`
      "
      :aria-pressed="isSpeaking"
      @click.stop="handleSpeak"
    >
      <svg
        class="vp-action-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path v-if="isSpeaking" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </svg>
    </button>

    <button
      v-if="canWrite"
      type="button"
      class="vp-write-btn"
      :title="`Practicar escritura: ${targetWriteText}`"
      :aria-label="`Practicar escritura en chino de ${targetWriteText}`"
      @click.stop="handleWrite"
    >
      <svg
        class="vp-action-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    </button>
  </span>
</template>

<style scoped>
.vp-speak-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  vertical-align: middle;
  margin-left: 0.35em;
  white-space: nowrap;
}

.vp-speak-btn,
.vp-write-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.14rem 0.38rem;
  min-width: 1.58rem;
  min-height: 1.38rem;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.1s ease;
}

.vp-speak-btn:hover,
.vp-write-btn:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-speak-btn:active,
.vp-write-btn:active {
  transform: scale(0.93);
}

.vp-speak-btn:focus-visible,
.vp-write-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-speak-btn.is-speaking {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-action-icon {
  width: 0.86rem;
  height: 0.86rem;
  flex-shrink: 0;
}
</style>
