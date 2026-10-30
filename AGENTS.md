# Reglas del Proyecto (`hanyu-eoi`)

Wiki de apuntes y lecciones de chino mandarín construida con **VitePress** + **Vue 3** (`docs/`) y scripts auxiliares en **Python** (`scripts/`).

## Estructura y formato de las lecciones (`docs/lecciones/*.md`)

Cada archivo de lección en `docs/lecciones/` (excepto `index.md`) debe cumplir estas reglas:

1. **Frontmatter YAML obligatorio** con `title` y `description`.
2. **Secciones obligatorias** (validadas por `scripts/verify_lessons.py`):
   - `## 📝 Vocabulario Clave`
   - `## 📐 Estructuras Gramaticales y Patrones`
   - `## 💬 Diálogos Clave`
   - `## 💡 Fonética y Notas Útiles`
3. **Pinyin diacrítico siempre**: usar marcas tonales (`*nǐ hǎo*`, `*lǚ*`), nunca números (`*ni3 hao3*`).
4. **Caracteres CJK estándar**: no usar radicales Kangxi ni variantes de compatibilidad (`U+2E80–U+2FDF`, `U+F900–U+FAFF`).
5. **Índice**: al añadir una nueva lección en `docs/lecciones/`, añadir también su enlace en `docs/lecciones/index.md` (el menú lateral de VitePress se genera automáticamente en `docs/.vitepress/config.mts`).

## Uso obligatorio de `<Speak />` y `<Sentence />` en las lecciones Markdown

Los componentes Vue `<Speak />` (`docs/.vitepress/theme/components/Speak.vue`) y `<Sentence />` (`docs/.vitepress/theme/components/Sentence.vue`) están registrados globalmente en VitePress y reproducen audio en mandarín (`zh-CN`) mediante la Web Speech API nativa (`docs/.vitepress/theme/composables/useSpeech.ts`).

Al crear o editar cualquier lección en `docs/lecciones/*.md`:

1. **Tablas de vocabulario y tablas de frases/derivación → usar `<Speak />`**:
   - **Columna Hanzi**: colocar `<Speak />` justo después del término en negrita:
     ```markdown
     | **你好** <Speak text="你好"/> | *nǐ hǎo* | Expr. | Hola | 你好！ <Speak text="你好！"/> (¡Hola!) |
     ```
   - **Variantes con `/`**:
     - Si tienen **pronunciación distinta**, añadir un `<Speak />` a cada variante: `**汉语** <Speak text="汉语"/> / **中文** <Speak text="中文"/>`.
     - Si son **homófonos exactos**, usar un único botón al final con la primera grafía: `**他 / 她 / 它** <Speak text="他"/>`.
   - **Columna de frase de ejemplo**: colocar `<Speak />` entre la frase en chino y la traducción entre paréntesis.
   - Pasar únicamente Hanzi en `text="..."` (sin pinyin, traducción, `/` ni `——`).

2. **Frases de ejemplo en `Estructuras Gramaticales y Patrones` → usar `<Sentence />`**:
   - No aplicar a títulos, notas teóricas ni fórmulas gramaticales (`> **Fórmula:** ...`), que deben permanecer en Markdown estándar.
   - Dejar una línea en blanco antes y después de cada bloque `<Sentence />`:
     ```vue
     <Sentence
       hz="我是学生。"
       py="Wǒ shì xuéshēng."
       es="Yo soy estudiante."
     />
     ```

3. **Intervenciones en `Diálogos Clave` (y diálogos adicionales) → usar `<Sentence speaker="..." />`**:
   - Usar la prop `speaker` para identificar al interlocutor:
     ```vue
     <Sentence
       speaker="A"
       hz="你好！"
       py="Nǐ hǎo!"
       es="¡Hola!"
     />
     ```

## Verificación antes de finalizar cambios

Siempre que se creen o modifiquen lecciones o componentes del tema, ejecutar:

```bash
uv run scripts/verify_lessons.py
pnpm docs:build
```

