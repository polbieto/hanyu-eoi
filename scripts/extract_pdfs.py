"""Extrae texto (y OCR en páginas sin texto) de los PDFs de `raw_slides/` a `cache/`.

Solo macOS (usa PDFKit y Vision mediante `pdf_extract.m`, que se compila con clang).

Uso:
    uv run scripts/extract_pdfs.py                 # todos los PDFs de raw_slides/
    uv run scripts/extract_pdfs.py "raw_slides/tema 0"
    uv run scripts/extract_pdfs.py --force         # sobrescribe lo ya extraído
"""

import argparse
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "scripts" / "pdf_extract.m"
BINARY = ROOT / "scripts" / ".bin" / "pdf_extract"


def build_binary() -> None:
    """Compila el extractor si no existe o si el fuente es más nuevo."""
    if BINARY.exists() and BINARY.stat().st_mtime >= SOURCE.stat().st_mtime:
        return
    BINARY.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "clang", "-fobjc-arc", "-fmodules-cache-path=/tmp/clang-cache",
            "-framework", "Foundation", "-framework", "PDFKit",
            "-framework", "Vision", "-framework", "AppKit",
            str(SOURCE), "-o", str(BINARY),
        ],
        check=True,
    )


CJK_SUPPLEMENT_MAP = {
    "\u2ec4": "西",
    "\u2ec5": "见",
    "\u2ec8": "言",
    "\u2ec9": "贝",
    "\u2ecb": "车",
    "\u2ed3": "长",
    "\u2ed4": "门",
    "\u2ed9": "韦",
    "\u2eda": "页",
    "\u2edb": "风",
    "\u2edc": "飞",
    "\u2ee0": "饣",
    "\u2ee2": "马",
    "\u2ee5": "鱼",
    "\u2ee6": "鸟",
    "\u2ee8": "麦",
    "\u2ee9": "黄",
    "\u2eec": "齐",
    "\u2eee": "齿",
    "\u2ef0": "龙",
    "\u2ef3": "龟",
}


def normalize_cjk_radicals(text: str) -> str:
    """Convierte radicales Kangxi / de compatibilidad (p. ej. ⻢, ⼀, ⻄) a caracteres estándar."""
    out = []
    for ch in text:
        if ch in CJK_SUPPLEMENT_MAP:
            out.append(CJK_SUPPLEMENT_MAP[ch])
            continue
        cp = ord(ch)
        if 0x2E80 <= cp <= 0x2FDF or 0xF900 <= cp <= 0xFAFF:
            out.append(unicodedata.normalize("NFKC", ch))
        else:
            out.append(ch)
    return "".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("src", nargs="?", default=str(ROOT / "raw_slides"), help="Carpeta con PDFs (búsqueda recursiva)")
    parser.add_argument("--out", default=str(ROOT / "cache"), help="Carpeta de salida")
    parser.add_argument("--force", action="store_true", help="Sobrescribir archivos existentes")
    parser.add_argument("--no-ocr", action="store_true", help="No usar OCR en páginas sin texto")
    args = parser.parse_args()

    if sys.platform != "darwin":
        print("Este extractor solo funciona en macOS.", file=sys.stderr)
        return 1

    build_binary()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(Path(args.src).rglob("*.pdf"))
    if not pdfs:
        print(f"No se encontraron PDFs en {args.src}")
        return 0

    for pdf in pdfs:
        target = out_dir / f"{pdf.stem.strip()}.md"
        if target.exists() and not args.force:
            print(f"SKIP  {target.name} (ya existe)")
            continue
        cmd = [str(BINARY), str(pdf)] + ([] if args.no_ocr else ["--ocr"])
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        text = normalize_cjk_radicals(res.stdout)
        target.write_text(text, encoding="utf-8")
        print(f"OK    {target.name}: {text.count('=== PAGE ')} páginas, {text.count('[OCR]')} con OCR")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

