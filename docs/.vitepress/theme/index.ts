import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Speak from './components/Speak.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Speak', Speak)
  }
} satisfies Theme

