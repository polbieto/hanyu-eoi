<script lang="ts">
import { ref } from 'vue'

const voices = ref<SpeechSynthesisVoice[]>([])

function normalizeLang(lang: string): string {
  return lang.trim().replace('_', '-')
}

function refreshVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const loaded = window.speechSynthesis.getVoices()
  if (loaded.length > 0) {
    voices.value = loaded
  }
}
</script>

<script setup lang="ts">
import { onMounted } from 'vue'

interface Props {
  text: string
  rate?: number
  pitch?: number
}

const props = withDefaults(defineProps<Props>(), {
  rate: 0.9,
  pitch: 1.0
})

const isSupported = ref(true)
const isSpeaking = ref(false)

function getBestVoice(): SpeechSynthesisVoice | undefined {
  if (voices.value.length === 0) {
    refreshVoices()
  }

  const zhVoices = voices.value.filter((v) =>
    v.lang.toLowerCase().startsWith('zh')
  )
  if (zhVoices.length === 0) return undefined

  const isZhCN = (v: SpeechSynthesisVoice) =>
    normalizeLang(v.lang).toLowerCase() === 'zh-cn'
  const isNeural = (v: SpeechSynthesisVoice) =>
    /Natural|Online|Xiaoxiao|Yunxi/i.test(v.name)

  // 1. Voces neuronales online/naturales (priorizando mandarín continental zh-CN)
  const neuralZhCN =
    zhVoices.find((v) => isZhCN(v) && /Xiaoxiao|Yunxi/i.test(v.name)) ??
    zhVoices.find((v) => isZhCN(v) && isNeural(v))
  if (neuralZhCN) return neuralZhCN

  const neuralAny = zhVoices.find(isNeural)
  if (neuralAny) return neuralAny

  // 2. Voces nativas de Google para chino continental
  const googleVoice = zhVoices.find(
    (v) =>
      v.name.includes('Google 普通话') ||
      (v.name.includes('Google') && isZhCN(v))
  )
  if (googleVoice) return googleVoice

  // 3. Voces de alta calidad de Apple / macOS / iOS
  const appleMandarin = zhVoices.find((v) =>
    /Tingting|Ting-Ting|Lili/i.test(v.name)
  )
  if (appleMandarin) return appleMandarin

  const appleFallback = zhVoices.find((v) => /Sinji|Sin-ji/i.test(v.name))
  if (appleFallback) return appleFallback

  // 4. Fallback a cualquier voz con código de idioma exacto 'zh-CN'
  const exactZhCN = zhVoices.find(isZhCN)
  if (exactZhCN) return exactZhCN

  // 5. Fallback a cualquier voz cuyo idioma empiece por 'zh'
  return zhVoices[0]
}

function speak() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

  const content = props.text.trim()
  if (!content) return

  window.speechSynthesis.cancel()
  isSpeaking.value = false

  const utterance = new SpeechSynthesisUtterance(content)
  const bestVoice = getBestVoice()

  if (bestVoice) {
    utterance.voice = bestVoice
    utterance.lang = normalizeLang(bestVoice.lang)
  } else {
    utterance.lang = 'zh-CN'
  }

  utterance.rate = props.rate
  utterance.pitch = props.pitch

  utterance.onstart = () => {
    isSpeaking.value = true
  }
  utterance.onend = () => {
    isSpeaking.value = false
  }
  utterance.onerror = () => {
    isSpeaking.value = false
  }

  window.speechSynthesis.speak(utterance)
}

onMounted(() => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    isSupported.value = false
    return
  }

  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
})
</script>

<template>
  <button
    v-if="isSupported"
    type="button"
    class="vp-speak-btn"
    :class="{ 'is-speaking': isSpeaking }"
    :title="`Escuchar pronunciación: ${text}`"
    :aria-label="`Escuchar pronunciación en chino de ${text}`"
    @click.stop="speak"
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
