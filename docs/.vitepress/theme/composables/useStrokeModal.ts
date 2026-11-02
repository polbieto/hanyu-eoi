import { computed, ref } from 'vue'

export const HANZI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/

export type StrokeModalMode = 'animate' | 'quiz'

export type PhraseToken =
  | { type: 'hanzi'; char: string; hanziIndex: number }
  | { type: 'sep'; text: string }

export interface OpenStrokeModalOptions {
  initialMode?: StrokeModalMode
  startIndex?: number
}

const isOpen = ref(false)
const rawPhrase = ref('')
const hanziChars = ref<string[]>([])
const activeIndex = ref(0)
const initialMode = ref<StrokeModalMode>('animate')
const openSession = ref(0)

export function hasHanzi(text: string | undefined | null): boolean {
  if (!text) return false
  return HANZI_REGEX.test(text)
}

export function extractHanziChars(text: string): string[] {
  return Array.from(text).filter((ch) => HANZI_REGEX.test(ch))
}

export function buildPhraseTokens(text: string): PhraseToken[] {
  const tokens: PhraseToken[] = []
  let hanziIndex = 0
  let pendingSep = ''

  const flushSep = () => {
    const cleaned = pendingSep
      .replace(/——+/g, '—')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned) {
      tokens.push({ type: 'sep', text: cleaned })
    }
    pendingSep = ''
  }

  for (const ch of Array.from(text.trim())) {
    if (HANZI_REGEX.test(ch)) {
      flushSep()
      tokens.push({ type: 'hanzi', char: ch, hanziIndex })
      hanziIndex++
    } else {
      pendingSep += ch
    }
  }

  flushSep()
  return tokens
}

export function openStrokeModal(
  text: string,
  options: OpenStrokeModalOptions = {}
): boolean {
  const chars = extractHanziChars(text)
  if (chars.length === 0) return false

  const startIdx = Math.min(
    Math.max(options.startIndex ?? 0, 0),
    chars.length - 1
  )

  rawPhrase.value = text.trim()
  hanziChars.value = chars
  activeIndex.value = startIdx
  initialMode.value = options.initialMode ?? 'animate'
  isOpen.value = true
  openSession.value++
  return true
}

export function closeStrokeModal() {
  isOpen.value = false
}

export function useStrokeModal() {
  const activeChar = computed(() => hanziChars.value[activeIndex.value] ?? '')
  const isPhraseMode = computed(() => hanziChars.value.length > 1)
  const phraseTokens = computed(() => buildPhraseTokens(rawPhrase.value))

  return {
    isOpen,
    rawPhrase,
    hanziChars,
    activeIndex,
    activeChar,
    isPhraseMode,
    phraseTokens,
    initialMode,
    openSession,
    openStrokeModal,
    closeStrokeModal
  }
}

