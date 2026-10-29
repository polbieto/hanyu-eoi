"""Valida las lecciones de `docs/lecciones/*.md`.

Comprueba: secciones obligatorias, ausencia de radicales CJK no estándar y de pinyin numérico.

Uso:
    uv run scripts/verify_lessons.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "docs" / "lecciones"
REQUIRED = [
    "## 📝 Vocabulario Clave",
    "## 📐 Estructuras Gramaticales y Patrones",
    "## 💬 Diálogos Clave",
    "## 💡 Fonética y Notas Útiles",
]


def main() -> int:
    files = [p for p in sorted(LESSONS.glob("*.md")) if p.name != "index.md"]
    errors: list[str] = []
    for md in files:
        text = md.read_text(encoding="utf-8")
        if not text.startswith("---\n"):
            errors.append(f"{md.name}: falta front matter")
        for ch in text:
            cp = ord(ch)
            if 0x2E80 <= cp <= 0x2FDF or 0xF900 <= cp <= 0xFAFF:
                errors.append(f"{md.name}: radical no estándar {ch!r} U+{cp:04X}")
        for sec in REQUIRED:
            if sec not in text:
                errors.append(f"{md.name}: falta sección {sec}")
        for m in re.finditer(r"\*([^*]+)\*", text):
            if re.search(r"[a-zA-ZüÜ][1-5]\b", m.group(1)):
                errors.append(f"{md.name}: pinyin numérico en *{m.group(1)}*")

    print(f"Revisadas {len(files)} lecciones.")
    for e in errors:
        print("ERROR:", e)
    if not errors:
        print("Todo correcto.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

