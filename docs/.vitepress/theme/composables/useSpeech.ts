import { computed, onMounted, ref } from 'vue'

const voices = ref<SpeechSynthesisVoice[]>([])
const activeToken = ref<symbol | null>(null)
let listenerAttached = false

function normalizeLang(lang: string): string {
  return lang.trim().replace('_', '-')
}

export function sanitizeZhText(raw: string): string {
  return raw
    .replace(/——+|—+/g, ' ')
    .replace(/([。！？!?])\s*\/\s*/g, '$1 ')
    .replace(/\s*\/\s*/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
}

function refreshVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const loaded = window.speechSynthesis.getVoices()
  if (loaded.length > 0) {
    voices.value = loaded
  }
}

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
    /Natural|Online|Xiaoxiao|Yunxi|Xiaoyi|Yunjian|Premium|Enhanced/i.test(v.name)

  // 1. Voces neuronales/mejoradas naturales (priorizando mandarín continental zh-CN)
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
    /Tingting|Ting-Ting|Lili|Meijia/i.test(v.name)
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

export function useSpeech() {
  const isSupported = ref(true)
  const instanceToken = Symbol('speech-instance')
  const isSpeaking = computed(() => activeToken.value === instanceToken)

  function speak(rawText: string, rate = 0.9, pitch = 1.0) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const content = sanitizeZhText(rawText)
    if (!content) return

    if (activeToken.value === instanceToken) {
      window.speechSynthesis.cancel()
      activeToken.value = null
      return
    }

    window.speechSynthesis.cancel()
    activeToken.value = instanceToken

    const utterance = new SpeechSynthesisUtterance(content)
    const bestVoice = getBestVoice()

    if (bestVoice) {
      utterance.voice = bestVoice
      utterance.lang = normalizeLang(bestVoice.lang)
    } else {
      utterance.lang = 'zh-CN'
    }

    utterance.rate = rate
    utterance.pitch = pitch

    utterance.onstart = () => {
      activeToken.value = instanceToken
    }
    utterance.onend = () => {
      if (activeToken.value === instanceToken) {
        activeToken.value = null
      }
    }
    utterance.onerror = () => {
      if (activeToken.value === instanceToken) {
        activeToken.value = null
      }
    }

    window.speechSynthesis.speak(utterance)
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      isSupported.value = false
      return
    }

    refreshVoices()
    if (!listenerAttached) {
      listenerAttached = true
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
      } else {
        window.speechSynthesis.onvoiceschanged = refreshVoices
      }
    }
  })

  return {
    isSupported,
    isSpeaking,
    speak
  }
}

