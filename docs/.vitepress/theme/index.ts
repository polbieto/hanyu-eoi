import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Speak from './components/Speak.vue'
import Sentence from './components/Sentence.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Speak', Speak)
    app.component('Sentence', Sentence)
  }
} satisfies Theme
