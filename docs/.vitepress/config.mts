import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const leccionesDir = path.resolve(__dirname, '../lecciones')

function extractTitle(raw: string, fallback: string) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fm) {
    const t = fm[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)
    if (t) return t[1]
  }
  const h1 = raw.replace(/^---[\s\S]*?\r?\n---/, '').match(/^#\s+(.+?)\s*$/m)
  return h1 ? h1[1] : fallback
}

const TEMA_TITLES: Record<string, string> = {
  '0': 'Tema 0 — Introducción y Pinyin',
  '1': 'Tema 1 — Saludos, Nacionalidades e Idiomas'
}

function getLessonSidebarGroups() {
  if (!fs.existsSync(leccionesDir)) return []
  const files = fs
    .readdirSync(leccionesDir)
    .filter(
      (file) =>
        file.endsWith('.md') &&
        file !== 'index.md' &&
        !file.startsWith('.') &&
        !file.startsWith('~') &&
        !file.startsWith('_')
    )
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))

  const groups = new Map<string, { text: string; link: string }[]>()
  for (const file of files) {
    const slug = file.replace(/\.md$/, '')
    const raw = fs.readFileSync(path.join(leccionesDir, file), 'utf-8')
    const temaKey = /^\d/.test(file) ? file[0] : 'otros'
    const groupTitle =
      TEMA_TITLES[temaKey] ??
      (temaKey === 'otros' ? 'Otras Lecciones' : `Tema ${temaKey}`)
    if (!groups.has(groupTitle)) groups.set(groupTitle, [])
    groups.get(groupTitle)!.push({
      text: extractTitle(raw, slug),
      link: encodeURI(`/lecciones/${slug}`)
    })
  }

  return Array.from(groups.entries()).map(([text, items]) => ({
    text,
    collapsed: false,
    items
  }))
}

export default defineConfig({
  title: 'Mis Apuntes de Chino',
  description: 'Temario y lecciones de chino mandarín sintetizados',
  lang: 'es-ES',
  cleanUrls: true,
  themeConfig: {
    search: {
      provider: 'local'
    },
    nav: [
      { text: 'Inicio', link: '/' },
      { text: 'Lecciones', link: '/lecciones/' }
    ],
    sidebar: {
      '/lecciones/': getLessonSidebarGroups()
    }
  }
})
