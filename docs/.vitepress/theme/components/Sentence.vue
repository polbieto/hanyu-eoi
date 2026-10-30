<script setup lang="ts">
import { ref } from 'vue'
import { useSpeech } from '../composables/useSpeech'

interface Props {
  hz: string
  py: string
  es: string
  speaker?: string
  tts?: string
  rate?: number
  pitch?: number
}

const props = withDefaults(defineProps<Props>(), {
  speaker: undefined,
  tts: undefined,
  rate: 0.9,
  pitch: 1.0
})

const isRevealed = ref(false)
const { isSupported, isSpeaking, speak } = useSpeech()

function handleSpeak() {
  speak(props.tts ?? props.hz, props.rate, props.pitch)
}

function toggleReveal() {
  isRevealed.value = !isRevealed.value
}
</script>

<template>
  <div class="vp-sentence" :class="{ 'is-speaking': isSpeaking }">
    <div class="vp-sentence-top">
      <span v-if="speaker" class="vp-sentence-speaker">{{ speaker }}:</span>
      <span class="vp-sentence-hz" lang="zh-CN">{{ hz }}</span>
      <button
        v-if="isSupported"
        type="button"
        class="vp-sentence-audio"
        :class="{ 'is-speaking': isSpeaking }"
        :title="isSpeaking ? 'Detener audio' : `Escuchar pronunciación: ${hz}`"
        :aria-label="
          isSpeaking
            ? 'Detener pronunciación'
            : `Escuchar pronunciación en chino de ${hz}`
        "
        :aria-pressed="isSpeaking"
        @click.stop="handleSpeak"
      >
        <svg
          class="vp-sentence-audio-icon"
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
    </div>

    <div class="vp-sentence-sub">
      <span
        class="vp-sentence-py"
        :class="{ 'is-revealed': isRevealed }"
        role="button"
        tabindex="0"
        :aria-expanded="isRevealed"
        :aria-label="
          isRevealed ? `Pinyin: ${py} (pulsa para ocultar)` : 'Mostrar pinyin'
        "
        :title="
          isRevealed
            ? 'Clic para ocultar el pinyin'
            : 'Pasa el ratón o toca para revelar el pinyin'
        "
        @click="toggleReveal"
        @keydown.enter.prevent="toggleReveal"
        @keydown.space.prevent="toggleReveal"
      >{{ py }}</span>
      <span class="vp-sentence-sep" aria-hidden="true">·</span>
      <span class="vp-sentence-es">{{ es }}</span>
    </div>
  </div>
</template>

<style scoped>
.vp-sentence {
  margin: 0.55rem 0;
  padding: 0.45rem 0.75rem;
  background-color: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-divider);
  border-radius: 6px;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.vp-sentence + .vp-sentence {
  margin-top: 0.35rem;
}

.vp-sentence.is-speaking {
  border-left-color: var(--vp-c-brand-1);
}

.vp-sentence-top {
  line-height: 1.5;
}

.vp-sentence-speaker {
  display: inline-block;
  margin-right: 0.4rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--vp-c-brand-1);
}

.vp-sentence-hz {
  font-size: 1.06rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  letter-spacing: 0.01em;
}

.vp-sentence-audio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
  margin-left: 0.4rem;
  padding: 0.16rem 0.42rem;
  min-width: 1.7rem;
  min-height: 1.45rem;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg);
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

.vp-sentence-audio:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-sentence-audio:active {
  transform: scale(0.93);
}

.vp-sentence-audio:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-sentence-audio.is-speaking {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-sentence-audio-icon {
  width: 0.92rem;
  height: 0.92rem;
  flex-shrink: 0;
}

.vp-sentence-sub {
  margin-top: 0.2rem;
  font-size: 0.88rem;
  line-height: 1.55;
}

.vp-sentence-py {
  display: inline;
  padding: 0.06rem 0.42rem;
  border-radius: 4px;
  font-style: italic;
  color: transparent;
  background-color: var(--vp-c-gray-1);
  background-color: color-mix(in srgb, var(--vp-c-text-2) 28%, var(--vp-c-bg-soft));
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  transition:
    color 0.18s ease,
    background-color 0.18s ease;
}

.vp-sentence-py.is-revealed,
.vp-sentence-py:focus-visible {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
  user-select: text;
  -webkit-user-select: text;
}

.vp-sentence-py:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  .vp-sentence-py:hover {
    color: var(--vp-c-brand-1);
    background-color: var(--vp-c-brand-soft);
    user-select: text;
    -webkit-user-select: text;
  }
}

.vp-sentence-sep {
  margin: 0 0.4rem;
  color: var(--vp-c-text-3);
  user-select: none;
}

.vp-sentence-es {
  color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
  .vp-sentence {
    padding: 0.4rem 0.6rem;
  }

  .vp-sentence-hz {
    font-size: 1.02rem;
  }

  .vp-sentence-sub {
    font-size: 0.85rem;
  }
}
</style>

