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

## Uso obligatorio del componente `<Speak />` en las lecciones Markdown

El componente Vue `<Speak />` (`docs/.vitepress/theme/components/Speak.vue`) está registrado globalmente en VitePress y reproduce audio en mandarín (`zh-CN`) mediante la Web Speech API nativa. Acepta las props `text` (requerida), `rate` (opcional, por defecto `0.9`) y `pitch` (opcional, por defecto `1.0`).

Al crear o editar cualquier lección en `docs/lecciones/*.md`, incluye `<Speak />` en los siguientes lugares:

1. **Tablas de vocabulario y tablas de frases/derivación**:
   - **Columna Hanzi**: colocar `<Speak />` justo después del término en negrita:
     ```markdown
     | **你好** <Speak text="你好"/> | *nǐ hǎo* | Expr. | Hola | 你好！ <Speak text="你好！"/> (¡Hola!) |
     ```
   - **Variantes con `/`**:
     - Si tienen **pronunciación distinta**, añadir un `<Speak />` a cada variante: `**汉语** <Speak text="汉语"/> / **中文** <Speak text="中文"/>`.
     - Si son **homófonos exactos**, usar un único botón al final con la primera grafía: `**他 / 她 / 它** <Speak text="他"/>`.
   - **Columna de frase de ejemplo**: colocar `<Speak />` entre la frase en chino y la traducción entre paréntesis.

2. **Ejemplos en `Estructuras Gramaticales y Patrones`**:
   - Añadir `<Speak />` al final de cada línea `- **Hanzi:**`:
     ```markdown
     - **Hanzi:** 我是学生。 <Speak text="我是学生。"/>
     - **Pinyin:** *Wǒ shì xuéshēng.*
     - **Español:** Yo soy estudiante.
     ```

3. **Intervenciones en `Diálogos Clave`**:
   - Añadir `<Speak />` al final de la línea en chino de cada intervención, **manteniendo siempre los dos espacios finales (`  `) detrás de `/>`** para preservar el salto de línea (`<br>`) antes del pinyin:
     ```markdown
     - **A:** 你好！ <Speak text="你好！"/>  
       *Nǐ hǎo!*  
       ¡Hola!
     ```

4. **Limpieza del atributo `text` para síntesis de voz (`zh-CN`)**:
   - Pasar únicamente el texto en caracteres chinos (Hanzi), nunca el pinyin ni la traducción en español.
   - **No incluir nunca `/` ni `——` dentro de `text="..."`** (el sintetizador lee `/` como *«斜杠»*):
     - En pares pregunta-respuesta unidos por raya (`——`), omitir `——` dentro de `text`: `- **Hanzi:** 你是哪国人？——我是中国人。 <Speak text="你是哪国人？我是中国人。"/>`.
     - Cuando una línea ofrezca dos frases alternativas separadas por ` / `, colocar un `<Speak />` independiente detrás de cada opción: `早上好！ <Speak text="早上好！"/> / 早！ <Speak text="早！"/>`.

## Verificación antes de finalizar cambios

Siempre que se creen o modifiquen lecciones o componentes del tema, ejecutar:

```bash
uv run scripts/verify_lessons.py
pnpm docs:build
```

