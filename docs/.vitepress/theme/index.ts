import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Speak from './components/Speak.vue'
import Sentence from './components/Sentence.vue'
import StrokeModal from './components/StrokeModal.vue'

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'layout-bottom': () => h(StrokeModal)
    })
  },
  enhanceApp({ app }) {
    app.component('Speak', Speak)
    app.component('Sentence', Sentence)
  }
} satisfies Theme
