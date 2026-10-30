<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'
import type HanziWriterType from 'hanzi-writer'
import { useSpeech } from '../composables/useSpeech'

const HANZI_REGEX = /[\u4e00-\u9fa5]/
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
  '.vp-sentence-audio',
  '.vp-sentence-py',
  '.VPNav',
  '.VPSidebar',
  '.VPLocalNav',
  '.VPLocalSearchBox',
  '#localsearch-list',
  '.DocSearch',
  '.vp-stroke-backdrop'
].join(', ')

type ModalMode = 'animate' | 'quiz'

const { isDark } = useData()
const route = useRoute()
const { isSupported: isSpeechSupported, isSpeaking, speak } = useSpeech()

const isClient = ref(false)
const isOpen = ref(false)
const activeChar = ref('')
const mode = ref<ModalMode>('animate')
const isLoading = ref(false)
const loadError = ref(false)
const totalStrokes = ref(0)
const currentStroke = ref(0)
const quizMistakes = ref(0)
const quizCompleted = ref(false)
const feedbackMessage = ref('')

const writerContainerRef = ref<HTMLElement | null>(null)
const closeBtnRef = ref<HTMLButtonElement | null>(null)

let writerInstance: HanziWriterType | null = null
let HanziWriterClass: typeof HanziWriterType | null = null
let initSessionId = 0

let longPressTimer: number | null = null
let mouseUpTimer: number | null = null
let touchStartPoint: { x: number; y: number } | null = null
let lastTouchTimestamp = 0
let suppressContextMenuUntil = 0
let previousActiveElement: HTMLElement | null = null

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

async function initWriter(char: string) {
  destroyWriter()
  const currentSession = initSessionId

  isLoading.value = true
  loadError.value = false
  totalStrokes.value = 0
  currentStroke.value = 0
  quizMistakes.value = 0
  quizCompleted.value = false
  feedbackMessage.value = ''
  mode.value = 'animate'

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

    writerInstance = HanziWriterClass.create(writerContainerRef.value, char, {
      width: 240,
      height: 240,
      padding: 16,
      showOutline: true,
      showCharacter: true,
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
        writerInstance?.animateCharacter()
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

async function openModal(char: string) {
  if (!HANZI_REGEX.test(char)) return

  previousActiveElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null

  activeChar.value = char
  isOpen.value = true
  document.documentElement.style.overflow = 'hidden'

  await nextTick()
  closeBtnRef.value?.focus({ preventScroll: true })
  await initWriter(char)
}

function closeModal() {
  if (!isOpen.value) return
  isOpen.value = false
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
  mode.value = 'quiz'
  currentStroke.value = 0
  quizMistakes.value = 0
  quizCompleted.value = false
  feedbackMessage.value = ''

  writerInstance.showOutline()
  writerInstance.hideCharacter({ duration: 150 })
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

function handleSpeak() {
  if (!activeChar.value) return
  speak(activeChar.value, 0.85, 1.0)
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

    openModal(char)
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
      openModal(selectedText)
    }
  }, 15)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    closeModal()
  }
}

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
        <div class="vp-stroke-modal">
          <div class="vp-stroke-header">
            <div class="vp-stroke-title-group">
              <span class="vp-stroke-char-preview" lang="zh-CN">{{ activeChar }}</span>
              <div class="vp-stroke-meta">
                <span class="vp-stroke-heading">Trazos y escritura</span>
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
              ✕
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

          <div class="vp-stroke-actions">
            <button
              type="button"
              class="vp-stroke-btn"
              :class="{ 'is-active': mode === 'animate' && !loadError }"
              :disabled="isLoading || loadError"
              @click="handleAnimate"
            >
              <span aria-hidden="true">▶</span>
              <span>Trazos</span>
            </button>

            <button
              type="button"
              class="vp-stroke-btn"
              :class="{ 'is-active': mode === 'quiz' && !loadError }"
              :disabled="isLoading || loadError"
              @click="handleQuiz"
            >
              <span aria-hidden="true">✏</span>
              <span>Probar</span>
            </button>

            <button
              v-if="isSpeechSupported"
              type="button"
              class="vp-stroke-btn"
              :class="{ 'is-speaking': isSpeaking }"
              @click="handleSpeak"
            >
              <span aria-hidden="true">🔊</span>
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
  padding: 1.15rem 1.2rem 1.2rem;
  background-color: var(--vp-c-bg-elv, var(--vp-c-bg));
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
  color: var(--vp-c-text-1);
  user-select: none;
  -webkit-user-select: none;
}

.vp-stroke-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.95rem;
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
  margin-bottom: 0.85rem;
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
