<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import type HanziWriterType from 'hanzi-writer'
import { useSpeech } from '../composables/useSpeech'
import {
  HANZI_REGEX,
  type StrokeModalMode,
  useStrokeModal
} from '../composables/useStrokeModal'

const LONG_PRESS_MS = 500
const TOUCH_MOVE_TOLERANCE_PX = 10
const CHAR_HIT_PADDING_PX = 14

const EXCLUDED_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="dialog"]',
  '[contenteditable="true"]',
  '.vp-speak-btn',
  '.vp-write-btn',
  '.vp-sentence-audio',
  '.vp-sentence-write',
  '.vp-sentence-py',
  '.VPNav',
  '.VPSidebar',
  '.VPLocalNav',
  '.VPLocalSearchBox',
  '#localsearch-list',
  '.DocSearch',
  '.vp-stroke-backdrop'
].join(', ')

const { isDark } = useData()
const route = useRoute()

const {
  isSupported: isSpeechSupported,
  isSpeaking: isCharSpeaking,
  speak: speakChar
} = useSpeech()

const {
  isSpeaking: isPhraseSpeaking,
  speak: speakPhrase
} = useSpeech()

const {
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
} = useStrokeModal()

const isClient = ref(false)
const mode = ref<StrokeModalMode>('animate')
const isLoading = ref(false)
const loadError = ref(false)
const totalStrokes = ref(0)
const currentStroke = ref(0)
const quizMistakes = ref(0)
const quizCompleted = ref(false)
const feedbackMessage = ref('')
const completedIndices = ref<Set<number>>(new Set())

const writerContainerRef = ref<HTMLElement | null>(null)
const closeBtnRef = ref<HTMLButtonElement | null>(null)
const phraseTrackRef = ref<HTMLElement | null>(null)

let writerInstance: HanziWriterType | null = null
let HanziWriterClass: typeof HanziWriterType | null = null
let initSessionId = 0

let longPressTimer: number | null = null
let mouseUpTimer: number | null = null
let touchStartPoint: { x: number; y: number } | null = null
let lastTouchTimestamp = 0
let suppressContextMenuUntil = 0
let previousActiveElement: HTMLElement | null = null

const hasPrev = computed(() => activeIndex.value > 0)
const hasNext = computed(() => activeIndex.value < hanziChars.value.length - 1)
const allPhraseCompleted = computed(
  () =>
    isPhraseMode.value &&
    hanziChars.value.length > 0 &&
    completedIndices.value.size >= hanziChars.value.length
)

const headingText = computed(() =>
  isPhraseMode.value
    ? `Escribir frase (${activeIndex.value + 1}/${hanziChars.value.length})`
    : 'Trazos y escritura'
)

const themePalette = computed(() =>
  isDark.value
    ? {
        strokeColor: '#dfdfd6',
        radicalColor: '#a8b1ff',
        outlineColor: '#3a3a42',
        drawingColor: '#a8b1ff',
        highlightColor: '#5c73e7',
        highlightCompleteColor: '#34d399'
      }
    : {
        strokeColor: '#2c3e50',
        radicalColor: '#3451b2',
        outlineColor: '#dcdce2',
        drawingColor: '#3451b2',
        highlightColor: '#5c73e7',
        highlightCompleteColor: '#10b981'
      }
)

const statusText = computed(() => {
  if (isLoading.value) return 'Cargando trazos…'
  if (loadError.value) return 'Datos de trazos no disponibles sin conexión'
  if (feedbackMessage.value) return feedbackMessage.value
  if (mode.value === 'quiz') {
    if (quizCompleted.value) {
      if (allPhraseCompleted.value) {
        return quizMistakes.value === 0
          ? '¡Excelente! Frase completada sin errores'
          : `¡Frase completada! (${quizMistakes.value} ${quizMistakes.value === 1 ? 'error' : 'errores'})`
      }
      if (isPhraseMode.value && hasNext.value) {
        return quizMistakes.value === 0
          ? '¡Perfecto! Pulsa «Siguiente» para continuar'
          : `¡Completado! (${quizMistakes.value} ${quizMistakes.value === 1 ? 'error' : 'errores'}) · Pulsa «Siguiente»`
      }
      return quizMistakes.value === 0
        ? '¡Perfecto! Carácter completado sin errores'
        : `¡Completado! (${quizMistakes.value} ${quizMistakes.value === 1 ? 'error' : 'errores'})`
    }
    if (totalStrokes.value > 0) {
      return `Dibuja el trazo ${Math.min(currentStroke.value + 1, totalStrokes.value)} de ${totalStrokes.value}`
    }
    return 'Dibuja los trazos en orden sobre la cuadrícula'
  }
  return totalStrokes.value > 0
    ? `Orden de escritura · ${totalStrokes.value} ${totalStrokes.value === 1 ? 'trazo' : 'trazos'}`
    : 'Orden de escritura'
})

function isIgnoredTarget(target: EventTarget | Node | null): boolean {
  if (!target) return true
  const el = target instanceof Element ? target : target.parentElement
  if (!el) return true
  if (el.closest(EXCLUDED_SELECTOR)) return true
  if (!el.closest('.VPContent, .vp-doc, main')) return true
  return false
}

function clearLongPressTimer() {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
  }
  touchStartPoint = null
}

function getCaretNodeAndOffset(
  x: number,
  y: number
): { node: Node; offset: number } | null {
  if (typeof document.caretRangeFromPoint === 'function') {
    const range = document.caretRangeFromPoint(x, y)
    if (range) {
      return { node: range.startContainer, offset: range.startOffset }
    }
  }

  const docWithCaretPos = document as Document & {
    caretPositionFromPoint?: (
      cx: number,
      cy: number
    ) => { offsetNode: Node; offset: number } | null
  }

  if (typeof docWithCaretPos.caretPositionFromPoint === 'function') {
    const pos = docWithCaretPos.caretPositionFromPoint(x, y)
    if (pos) {
      return { node: pos.offsetNode, offset: pos.offset }
    }
  }

  return null
}

function extractHanziAtPoint(x: number, y: number): string | null {
  const hitElement = document.elementFromPoint(x, y)
  if (isIgnoredTarget(hitElement)) return null

  const caret = getCaretNodeAndOffset(x, y)
  if (!caret) return null

  const { node, offset } = caret
  if (node.nodeType !== Node.TEXT_NODE || isIgnoredTarget(node)) return null

  const text = node.textContent ?? ''
  if (!text) return null

  const candidates = [offset, offset - 1].filter(
    (idx, pos, arr) => idx >= 0 && idx < text.length && arr.indexOf(idx) === pos
  )

  let bestChar: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const idx of candidates) {
    const ch = text[idx]
    if (!HANZI_REGEX.test(ch)) continue

    const charRange = document.createRange()
    charRange.setStart(node, idx)
    charRange.setEnd(node, idx + 1)
    const rect = charRange.getBoundingClientRect()

    if (rect.width === 0 && rect.height === 0) continue

    const withinX =
      x >= rect.left - CHAR_HIT_PADDING_PX &&
      x <= rect.right + CHAR_HIT_PADDING_PX
    const withinY =
      y >= rect.top - CHAR_HIT_PADDING_PX &&
      y <= rect.bottom + CHAR_HIT_PADDING_PX

    if (!withinX || !withinY) continue

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dist = Math.hypot(x - centerX, y - centerY)

    if (dist < bestDistance) {
      bestDistance = dist
      bestChar = ch
    }
  }

  return bestChar
}

function scrollActivePillIntoView(behavior: ScrollBehavior = 'smooth') {
  const track = phraseTrackRef.value
  if (!track) return
  const activeEl = track.querySelector<HTMLElement>('[data-active="true"]')
  if (!activeEl) return

  const targetLeft =
    activeEl.offsetLeft - track.clientWidth / 2 + activeEl.offsetWidth / 2
  track.scrollTo({
    left: Math.max(0, targetLeft),
    behavior
  })
}

function destroyWriter() {
  initSessionId++
  if (writerInstance) {
    try {
      writerInstance.cancelQuiz()
      writerInstance._renderState?.cancelAll()
      writerInstance._hanziWriterRenderer?.destroy()
    } catch {
      // Ignorar errores de limpieza si el renderizador aún no terminó de montar
    }
    writerInstance = null
  }
  if (writerContainerRef.value) {
    writerContainerRef.value.innerHTML = ''
  }
}

function preloadUpcomingChars() {
  if (!HanziWriterClass || !isPhraseMode.value) return
  for (let offset = 1; offset <= 2; offset++) {
    const nextCh = hanziChars.value[activeIndex.value + offset]
    if (nextCh) {
      HanziWriterClass.loadCharacterData(nextCh).catch(() => {})
    }
  }
}

function runQuizOnWriter(fromCleanHiddenInit: boolean) {
  if (!writerInstance) return
  mode.value = 'quiz'
  currentStroke.value = 0
  quizMistakes.value = 0
  quizCompleted.value = false
  feedbackMessage.value = ''

  if (!fromCleanHiddenInit) {
    writerInstance.hideOutline()
    writerInstance.hideCharacter({ duration: 150 })
  }

  const capturedIndex = activeIndex.value

  writerInstance.quiz({
    leniency: 1.1,
    showHintAfterMisses: 3,
    highlightOnComplete: true,
    onCorrectStroke(data) {
      currentStroke.value = data.strokeNum + 1
      feedbackMessage.value = ''
    },
    onMistake(data) {
      quizMistakes.value = data.totalMistakes
      feedbackMessage.value =
        data.mistakesOnStroke >= 3
          ? 'Observa la pista en azul e inténtalo de nuevo'
          : 'Orden o dirección incorrectos, prueba otra vez'
    },
    onComplete(summary) {
      quizMistakes.value = summary.totalMistakes
      quizCompleted.value = true
      feedbackMessage.value = ''

      const updated = new Set(completedIndices.value)
      updated.add(capturedIndex)
      completedIndices.value = updated

      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(25)
        } catch {
          // Vibración bloqueada o no soportada
        }
      }
    }
  })
}

async function initWriter(char: string, targetMode: StrokeModalMode = 'animate') {
  destroyWriter()
  if (!char) return
  const currentSession = initSessionId

  isLoading.value = true
  loadError.value = false
  totalStrokes.value = 0
  currentStroke.value = 0
  quizMistakes.value = 0
  quizCompleted.value = false
  feedbackMessage.value = ''
  mode.value = targetMode

  await nextTick()
  const container = writerContainerRef.value
  if (!container || !isOpen.value) return

  try {
    if (!HanziWriterClass) {
      const mod = await import('hanzi-writer')
      HanziWriterClass = mod.default
    }

    if (currentSession !== initSessionId || !isOpen.value || !writerContainerRef.value) {
      return
    }

    const colors = themePalette.value
    const startAsQuiz = targetMode === 'quiz'

    writerInstance = HanziWriterClass.create(writerContainerRef.value, char, {
      width: 240,
      height: 240,
      padding: 16,
      showOutline: !startAsQuiz,
      showCharacter: !startAsQuiz,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 220,
      strokeFadeDuration: 300,
      drawingWidth: 18,
      leniency: 1.1,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      strokeColor: colors.strokeColor,
      radicalColor: colors.radicalColor,
      outlineColor: colors.outlineColor,
      drawingColor: colors.drawingColor,
      highlightColor: colors.highlightColor,
      highlightCompleteColor: colors.highlightCompleteColor,
      onLoadCharDataSuccess(data) {
        if (currentSession !== initSessionId) return
        isLoading.value = false
        loadError.value = false
        totalStrokes.value = data.strokes.length
        preloadUpcomingChars()

        if (mode.value === 'quiz') {
          runQuizOnWriter(startAsQuiz)
        } else {
          writerInstance?.animateCharacter()
        }
      },
      onLoadCharDataError() {
        if (currentSession !== initSessionId) return
        isLoading.value = false
        loadError.value = true
      }
    })
  } catch {
    if (currentSession !== initSessionId) return
    isLoading.value = false
    loadError.value = true
  }
}

function closeModal() {
  if (!isOpen.value) return
  closeStrokeModal()
  document.documentElement.style.overflow = ''
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  destroyWriter()
  if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
    previousActiveElement.focus({ preventScroll: true })
    previousActiveElement = null
  }
}

async function goToChar(index: number) {
  if (index < 0 || index >= hanziChars.value.length || index === activeIndex.value) {
    return
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
  activeIndex.value = index
  await nextTick()
  scrollActivePillIntoView('smooth')
  await initWriter(activeChar.value, mode.value)
}

function prevChar() {
  if (hasPrev.value) {
    goToChar(activeIndex.value - 1)
  }
}

function nextChar() {
  if (hasNext.value) {
    goToChar(activeIndex.value + 1)
  }
}

function handleAnimate() {
  if (!writerInstance || isLoading.value || loadError.value) return
  mode.value = 'animate'
  quizCompleted.value = false
  feedbackMessage.value = ''
  writerInstance.cancelQuiz()
  writerInstance.showOutline()
  writerInstance.animateCharacter()
}

function handleQuiz() {
  if (!writerInstance || isLoading.value || loadError.value) return
  runQuizOnWriter(false)
}

function handleSpeakChar() {
  if (!activeChar.value) return
  speakChar(activeChar.value, 0.85, 1.0)
}

function handleSpeakPhrase() {
  if (!rawPhrase.value) return
  speakPhrase(rawPhrase.value, 0.9, 1.0)
}

function onTouchStart(event: TouchEvent) {
  lastTouchTimestamp = Date.now()
  clearLongPressTimer()

  if (isOpen.value || event.touches.length !== 1) return
  if (isIgnoredTarget(event.target)) return

  const touch = event.touches[0]
  const startX = touch.clientX
  const startY = touch.clientY
  touchStartPoint = { x: startX, y: startY }

  longPressTimer = window.setTimeout(() => {
    longPressTimer = null
    if (isOpen.value) return

    const char = extractHanziAtPoint(startX, startY)
    if (!char) return

    suppressContextMenuUntil = Date.now() + 900
    window.getSelection()?.removeAllRanges()

    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(40)
      } catch {
        // Ignorar si el navegador restringe navigator.vibrate
      }
    }

    openStrokeModal(char, { initialMode: 'animate' })
  }, LONG_PRESS_MS)
}

function onTouchMove(event: TouchEvent) {
  lastTouchTimestamp = Date.now()
  if (longPressTimer === null || !touchStartPoint || event.touches.length !== 1) {
    clearLongPressTimer()
    return
  }

  const touch = event.touches[0]
  const distance = Math.hypot(
    touch.clientX - touchStartPoint.x,
    touch.clientY - touchStartPoint.y
  )
  if (distance > TOUCH_MOVE_TOLERANCE_PX) {
    clearLongPressTimer()
  }
}

function onTouchEnd() {
  lastTouchTimestamp = Date.now()
  clearLongPressTimer()
}

function onContextMenu(event: MouseEvent) {
  if (Date.now() < suppressContextMenuUntil) {
    event.preventDefault()
  }
}

function onMouseUp(event: MouseEvent) {
  if (isOpen.value) return
  if (Date.now() - lastTouchTimestamp < 650) return
  if (event.button !== 0) return
  if (isIgnoredTarget(event.target)) return

  if (mouseUpTimer !== null) {
    window.clearTimeout(mouseUpTimer)
  }

  mouseUpTimer = window.setTimeout(() => {
    mouseUpTimer = null
    if (isOpen.value) return

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    if (isIgnoredTarget(selection.anchorNode) || isIgnoredTarget(selection.focusNode)) {
      return
    }

    const selectedText = selection.toString().trim()
    if (Array.from(selectedText).length === 1 && HANZI_REGEX.test(selectedText)) {
      selection.removeAllRanges()
      openStrokeModal(selectedText, { initialMode: 'animate' })
    }
  }, 15)
}

function onKeyDown(event: KeyboardEvent) {
  if (!isOpen.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeModal()
    return
  }

  if (isPhraseMode.value && event.key === 'ArrowLeft' && hasPrev.value) {
    event.preventDefault()
    prevChar()
    return
  }

  if (isPhraseMode.value && event.key === 'ArrowRight' && hasNext.value) {
    event.preventDefault()
    nextChar()
  }
}

watch(openSession, async () => {
  if (!isClient.value || !isOpen.value) return

  if (!previousActiveElement) {
    previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  completedIndices.value = new Set()
  mode.value = initialMode.value
  document.documentElement.style.overflow = 'hidden'

  await nextTick()
  closeBtnRef.value?.focus({ preventScroll: true })
  scrollActivePillIntoView('auto')
  await initWriter(activeChar.value, initialMode.value)
})

watch(isDark, () => {
  if (!writerInstance || !isOpen.value || loadError.value) return
  const colors = themePalette.value
  writerInstance.updateColor('strokeColor', colors.strokeColor, { duration: 150 })
  writerInstance.updateColor('radicalColor', colors.radicalColor, { duration: 150 })
  writerInstance.updateColor('outlineColor', colors.outlineColor, { duration: 150 })
  writerInstance.updateColor('drawingColor', colors.drawingColor, { duration: 150 })
  writerInstance.updateColor('highlightColor', colors.highlightColor, { duration: 150 })
})

watch(
  () => route.path,
  () => {
    if (isOpen.value) {
      closeModal()
    }
  }
)

onMounted(() => {
  isClient.value = true
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: true })
  document.addEventListener('touchend', onTouchEnd, { passive: true })
  document.addEventListener('touchcancel', onTouchEnd, { passive: true })
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  clearLongPressTimer()
  if (mouseUpTimer !== null) {
    window.clearTimeout(mouseUpTimer)
    mouseUpTimer = null
  }
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('touchend', onTouchEnd)
  document.removeEventListener('touchcancel', onTouchEnd)
  document.removeEventListener('contextmenu', onContextMenu)
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('keydown', onKeyDown)
  document.documentElement.style.overflow = ''
  destroyWriter()
})
</script>

<template>
  <ClientOnly>
    <Teleport v-if="isClient" to="body">
      <Transition name="vp-stroke-fade">
        <div
          v-if="isOpen"
          class="vp-stroke-backdrop"
          role="dialog"
          aria-modal="true"
          :aria-label="`Orden de trazos y práctica del carácter ${activeChar}`"
          @click.self="closeModal"
        >
          <div class="vp-stroke-modal" :class="{ 'is-phrase': isPhraseMode }">
            <div class="vp-stroke-header">
              <div class="vp-stroke-title-group">
                <span class="vp-stroke-char-preview" lang="zh-CN">{{ activeChar }}</span>
                <div class="vp-stroke-meta">
                  <span class="vp-stroke-heading">{{ headingText }}</span>
                  <span class="vp-stroke-status" aria-live="polite">{{ statusText }}</span>
                </div>
              </div>

              <button
                ref="closeBtnRef"
                type="button"
                class="vp-stroke-close"
                title="Cerrar (Esc)"
                aria-label="Cerrar ventana de trazos"
                @click="closeModal"
              >
                <svg
                  class="vp-stroke-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <!-- Tira de caracteres de la palabra o frase -->
            <div v-if="isPhraseMode" class="vp-stroke-phrase-bar">
              <div
                ref="phraseTrackRef"
                class="vp-stroke-phrase-track"
                role="tablist"
                aria-label="Caracteres de la frase"
              >
                <template v-for="(token, idx) in phraseTokens" :key="idx">
                  <button
                    v-if="token.type === 'hanzi'"
                    type="button"
                    role="tab"
                    class="vp-stroke-char-pill"
                    :class="{
                      'is-current': token.hanziIndex === activeIndex,
                      'is-completed': completedIndices.has(token.hanziIndex)
                    }"
                    :data-active="token.hanziIndex === activeIndex ? 'true' : undefined"
                    :aria-selected="token.hanziIndex === activeIndex"
                    :title="`Carácter ${token.hanziIndex + 1} de ${hanziChars.length}: ${token.char}`"
                    lang="zh-CN"
                    @click="goToChar(token.hanziIndex)"
                  >
                    <span>{{ token.char }}</span>
                  </button>
                  <span
                    v-else
                    class="vp-stroke-phrase-sep"
                    aria-hidden="true"
                  >{{ token.text }}</span>
                </template>
              </div>

              <button
                v-if="isSpeechSupported"
                type="button"
                class="vp-stroke-phrase-audio"
                :class="{ 'is-speaking': isPhraseSpeaking }"
                :title="isPhraseSpeaking ? 'Detener audio' : 'Escuchar frase completa'"
                :aria-label="
                  isPhraseSpeaking
                    ? 'Detener pronunciación'
                    : 'Escuchar pronunciación de la frase completa'
                "
                :aria-pressed="isPhraseSpeaking"
                @click="handleSpeakPhrase"
              >
                <svg
                  class="vp-stroke-icon"
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
                  <path v-if="isPhraseSpeaking" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              </button>
            </div>

            <div class="vp-stroke-canvas-wrap">
              <div
                class="vp-stroke-grid"
                :class="{ 'is-quiz': mode === 'quiz' && !loadError }"
              >
                <!-- Cuadrícula tradicional Mǐzìgé (米字格) -->
                <svg
                  class="vp-stroke-grid-svg"
                  viewBox="0 0 240 240"
                  aria-hidden="true"
                >
                  <rect
                    x="1"
                    y="1"
                    width="238"
                    height="238"
                    rx="8"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <line
                    x1="120"
                    y1="2"
                    x2="120"
                    y2="238"
                    stroke="currentColor"
                    stroke-width="1"
                    stroke-dasharray="5 5"
                    opacity="0.55"
                  />
                  <line
                    x1="2"
                    y1="120"
                    x2="238"
                    y2="120"
                    stroke="currentColor"
                    stroke-width="1"
                    stroke-dasharray="5 5"
                    opacity="0.55"
                  />
                  <line
                    x1="4"
                    y1="4"
                    x2="236"
                    y2="236"
                    stroke="currentColor"
                    stroke-width="1"
                    stroke-dasharray="4 6"
                    opacity="0.35"
                  />
                  <line
                    x1="236"
                    y1="4"
                    x2="4"
                    y2="236"
                    stroke="currentColor"
                    stroke-width="1"
                    stroke-dasharray="4 6"
                    opacity="0.35"
                  />
                </svg>

                <!-- Lienzo interactivo de HanziWriter -->
                <div
                  ref="writerContainerRef"
                  class="vp-stroke-writer"
                  :class="{ 'is-hidden': loadError }"
                />

                <!-- Fallback visual si no hay conexión o datos del carácter -->
                <div v-if="loadError" class="vp-stroke-fallback" lang="zh-CN">
                  {{ activeChar }}
                </div>
              </div>
            </div>

            <div class="vp-stroke-legend">
              <span class="vp-stroke-legend-item">
                <span class="vp-stroke-dot is-radical" aria-hidden="true" />
                Radical
              </span>
              <span class="vp-stroke-legend-item">
                <span class="vp-stroke-dot is-stroke" aria-hidden="true" />
                Trazos
              </span>
            </div>

            <!-- Paso manual entre caracteres de la palabra o frase -->
            <div v-if="isPhraseMode" class="vp-stroke-stepper">
              <button
                type="button"
                class="vp-stroke-step-btn"
                :disabled="!hasPrev"
                title="Carácter anterior (←)"
                aria-label="Carácter anterior"
                @click="prevChar"
              >
                <svg
                  class="vp-stroke-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span>Anterior</span>
              </button>

              <span class="vp-stroke-step-counter" aria-live="polite">
                {{ activeIndex + 1 }} / {{ hanziChars.length }}
              </span>

              <button
                type="button"
                class="vp-stroke-step-btn"
                :class="{ 'is-ready': quizCompleted && hasNext }"
                :disabled="!hasNext"
                title="Siguiente carácter (→)"
                aria-label="Siguiente carácter"
                @click="nextChar"
              >
                <span>Siguiente</span>
                <svg
                  class="vp-stroke-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            <div class="vp-stroke-actions">
              <button
                type="button"
                class="vp-stroke-btn"
                :class="{ 'is-active': mode === 'animate' && !loadError }"
                :disabled="isLoading || loadError"
                @click="handleAnimate"
              >
                <svg
                  class="vp-stroke-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Trazos</span>
              </button>

              <button
                type="button"
                class="vp-stroke-btn"
                :class="{ 'is-active': mode === 'quiz' && !loadError }"
                :disabled="isLoading || loadError"
                @click="handleQuiz"
              >
                <svg
                  class="vp-stroke-icon"
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
                <span>Probar</span>
              </button>

              <button
                v-if="isSpeechSupported"
                type="button"
                class="vp-stroke-btn"
                :class="{ 'is-speaking': isCharSpeaking }"
                :aria-pressed="isCharSpeaking"
                @click="handleSpeakChar"
              >
                <svg
                  class="vp-stroke-icon"
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
                  <path v-if="isCharSpeaking" d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
                <span>Oír</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.vp-stroke-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.vp-stroke-modal {
  width: 100%;
  max-width: 340px;
  max-height: calc(100dvh - 2rem);
  overflow-y: auto;
  padding: 1.15rem 1.2rem 1.2rem;
  background-color: var(--vp-c-bg-elv, var(--vp-c-bg));
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
  color: var(--vp-c-text-1);
  user-select: none;
  -webkit-user-select: none;
}

.vp-stroke-modal.is-phrase {
  max-width: 368px;
}

.vp-stroke-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.vp-stroke-title-group {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.vp-stroke-char-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  font-size: 1.55rem;
  font-weight: 600;
  line-height: 1;
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}

.vp-stroke-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.vp-stroke-heading {
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--vp-c-text-1);
}

.vp-stroke-status {
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--vp-c-text-2);
  margin-top: 0.1rem;
}

.vp-stroke-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  background-color: transparent;
  color: var(--vp-c-text-2);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.vp-stroke-close:hover {
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border-color: var(--vp-c-divider);
}

.vp-stroke-close:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-stroke-phrase-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.45rem;
  margin-bottom: 0.8rem;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
}

.vp-stroke-phrase-track {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
  padding: 0.1rem 0.05rem;
}

.vp-stroke-phrase-track::-webkit-scrollbar {
  height: 4px;
}

.vp-stroke-phrase-track::-webkit-scrollbar-thumb {
  background-color: var(--vp-c-divider);
  border-radius: 999px;
}

.vp-stroke-char-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.9rem;
  height: 1.9rem;
  padding: 0 0.3rem;
  flex-shrink: 0;
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.1s ease;
}

.vp-stroke-char-pill:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.vp-stroke-char-pill:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.vp-stroke-char-pill.is-completed {
  color: #059669;
  border-color: rgba(16, 185, 129, 0.55);
  background-color: rgba(16, 185, 129, 0.1);
}

:global(.dark) .vp-stroke-char-pill.is-completed {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.5);
  background-color: rgba(52, 211, 153, 0.12);
}

.vp-stroke-char-pill.is-current {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  font-weight: 700;
  box-shadow: 0 0 0 1px var(--vp-c-brand-1);
}

.vp-stroke-char-pill.is-current.is-completed::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background-color: #10b981;
}

.vp-stroke-phrase-sep {
  flex-shrink: 0;
  padding: 0 0.08rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-3);
  line-height: 1;
}

.vp-stroke-phrase-audio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  flex-shrink: 0;
  font-size: 0.82rem;
  line-height: 1;
  color: var(--vp-c-text-2);
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background-color 0.16s ease,
    border-color 0.16s ease;
}

.vp-stroke-phrase-audio:hover,
.vp-stroke-phrase-audio.is-speaking {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-stroke-phrase-audio:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.vp-stroke-canvas-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 0.65rem;
}

.vp-stroke-grid {
  position: relative;
  width: 240px;
  height: 240px;
  border-radius: 10px;
  background-color: var(--vp-c-bg-soft);
  transition: box-shadow 0.2s ease;
}

.vp-stroke-grid.is-quiz {
  cursor: crosshair;
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.vp-stroke-grid-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--vp-c-divider);
  pointer-events: none;
}

.vp-stroke-writer {
  position: relative;
  z-index: 1;
  width: 240px;
  height: 240px;
  touch-action: none;
}

.vp-stroke-writer.is-hidden {
  display: none;
}

.vp-stroke-fallback {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5rem;
  line-height: 1;
  color: var(--vp-c-text-1);
}

.vp-stroke-legend {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 0.8rem;
  font-size: 0.76rem;
  color: var(--vp-c-text-2);
}

.vp-stroke-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.vp-stroke-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
}

.vp-stroke-dot.is-radical {
  background-color: var(--vp-c-brand-1);
}

.vp-stroke-dot.is-stroke {
  background-color: var(--vp-c-text-1);
}

.vp-stroke-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}

.vp-stroke-step-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  flex: 1;
  padding: 0.44rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.1s ease;
}

.vp-stroke-step-btn:hover:not(:disabled) {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-stroke-step-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.vp-stroke-step-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-stroke-step-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.vp-stroke-step-btn.is-ready:not(:disabled) {
  color: #fff;
  background-color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.vp-stroke-step-btn.is-ready:hover:not(:disabled) {
  opacity: 0.92;
  color: #fff;
  background-color: var(--vp-c-brand-1);
}

.vp-stroke-step-counter {
  flex-shrink: 0;
  min-width: 3.2rem;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
}

.vp-stroke-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.vp-stroke-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.52rem 0.6rem;
  font-size: 0.86rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--vp-c-text-1);
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.1s ease;
}

.vp-stroke-btn:hover:not(:disabled) {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-stroke-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.vp-stroke-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.vp-stroke-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vp-stroke-btn.is-active,
.vp-stroke-btn.is-speaking {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background-color: var(--vp-c-brand-soft);
}

.vp-stroke-icon {
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
}

.vp-stroke-fade-enter-active,
.vp-stroke-fade-leave-active {
  transition: opacity 0.18s ease;
}

.vp-stroke-fade-enter-active .vp-stroke-modal,
.vp-stroke-fade-leave-active .vp-stroke-modal {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

.vp-stroke-fade-enter-from,
.vp-stroke-fade-leave-to {
  opacity: 0;
}

.vp-stroke-fade-enter-from .vp-stroke-modal,
.vp-stroke-fade-leave-to .vp-stroke-modal {
  transform: scale(0.95) translateY(6px);
  opacity: 0;
}
</style>
