"""
pipelines/structurer.py — The Core Brain of Maxcavator 2.0

Takes raw PyMuPDF document output and produces a rich, nested JSON schema:

  {
    document_id, metadata, sections, tables, images, links, raw_pages
  }

Key heuristics:
  • Heading detection  : font_size > page_avg * 1.2  OR  bold flag,
                         AND char_count < 80
  • Section assembly  : content between consecutive headings
  • Table caption     : text block immediately above/below a table matching
                        r"(Table|Figure|Source|Note)\\s*\\d*[:\\.]"
  • Cross-page tables : if the last column signature of page N matches the
                        first table of page N+1 exactly, merge rows/headers
  • Image extraction  : page.get_images(full=True) → PNG → pytesseract OCR
  • Link extraction   : page.get_links() filtered to type 'uri'
"""

from __future__ import annotations

import io
import os
import re
import time
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import pdfplumber
from PIL import Image

try:
    import pytesseract  # Optional — if not installed, OCR is skipped
    _TESSERACT_AVAILABLE = True
except ImportError:
    _TESSERACT_AVAILABLE = False

CAPTION_RE = re.compile(
    r"(Table|Figure|Fig\.|Source|Note)\s*\d*\s*[:\.\-]",
    re.IGNORECASE,
)

NOISE_HEADING_RE = re.compile(
    r"^(?:s\s*[-–]\s*\d+|page\s*\d+|\d+|\(?\d+\)?|[ivxlcdm]+)$",
    re.IGNORECASE,
)

# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────


def _avg_font_size(blocks: list[dict]) -> float:
    sizes: list[float] = []
    for blk in blocks:
        if blk.get("type") != 0:
            continue
        for line in blk.get("lines", []):
            for span in line.get("spans", []):
                sz = span.get("size", 0)
                if sz > 0:
                    sizes.append(sz)
    return sum(sizes) / len(sizes) if sizes else 12.0


def _is_bold(flags: int) -> bool:
    """PyMuPDF span flags: bit 4 (0x10) = bold."""
    return bool(flags & 0x10)


def _block_text(blk: dict) -> str:
    """Concatenate all span texts in a block."""
    parts: list[str] = []
    for line in blk.get("lines", []):
        for span in line.get("spans", []):
            parts.append(span.get("text", ""))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def _is_noise_heading(text: str) -> bool:
    """Reject heading candidates that are likely page markers, table rows, or prose lines."""
    t = re.sub(r"\s+", " ", text).strip()
    if not t:
        return True

    if NOISE_HEADING_RE.fullmatch(t):
        return True

    if "@" in t:
        return True

    words = t.split()
    if len(words) > 16:
        return True

    # Long sentence-like lines usually belong to content, not headings.
    if len(words) >= 10 and t.endswith((".", ",", ";", ":")):
        return True

    # Reject table-like token rows: many short symbols/tokens (e.g. element columns).
    tokens = re.findall(r"[A-Za-z0-9+\-\.]+", t)
    if len(tokens) >= 8:
        short_tokens = sum(1 for tok in tokens if len(tok) <= 2)
        if short_tokens / len(tokens) > 0.5:
            return True

    return False


def _normalize_section_text(text: str) -> str:
    """Normalize section content while preserving paragraph breaks."""
    if not text:
        return ""
    # Keep paragraph boundaries but remove excessive blank lines and trailing spaces.
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _block_max_font(blk: dict) -> float:
    sizes = []
    for line in blk.get("lines", []):
        for span in line.get("spans", []):
            sz = span.get("size", 0)
            if sz > 0:
                sizes.append(sz)
    return max(sizes, default=0.0)


def _block_is_bold(blk: dict) -> bool:
    for line in blk.get("lines", []):
        for span in line.get("spans", []):
            if _is_bold(span.get("flags", 0)):
                return True
    return False


def _classify_headings(
    all_page_blocks: list[list[dict]],
) -> list[tuple[int, int, str, float, int]]:
    """
    Return list of (page_num_1indexed, block_idx, heading_text, font_size, raw_flag).
    Assigns heading level based on font-size tiers across the whole document.
    """
    # Collect all heading-candidate (page, block_idx, text, size)
    candidates: list[tuple[int, int, str, float]] = []

    for page_num, blocks in enumerate(all_page_blocks, start=1):
        avg = _avg_font_size(blocks)
        for bi, blk in enumerate(blocks):
            if blk.get("type") != 0:
                continue
            text = _block_text(blk)
            if not text or len(text) > 150:
                continue
            max_sz = _block_max_font(blk)
            bold = _block_is_bold(blk)
            is_heading = (max_sz > avg * 1.2) or (bold and max_sz > avg * 1.05 and len(text) < 100)
            if is_heading and not _is_noise_heading(text):
                candidates.append((page_num, bi, text, max_sz))

    if not candidates:
        return []

    # Tier clustering: round font sizes to nearest 0.5 to group them
    sizes_sorted = sorted({round(c[3] * 2) / 2 for c in candidates}, reverse=True)
    size_to_level: dict[float, int] = {}
    for level, sz in enumerate(sizes_sorted[:6], start=1):
        size_to_level[sz] = level

    result = []
    for page_num, bi, text, sz in candidates:
        rounded = round(sz * 2) / 2
        level = size_to_level.get(rounded, len(sizes_sorted))
        result.append((page_num, bi, text, sz, level))

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Table merging across pages
# ─────────────────────────────────────────────────────────────────────────────

def _col_signature(headers: list[str]) -> tuple:
    """Normalised header signature for cross-page table matching."""
    return tuple(h.strip().lower() for h in headers if h.strip())


def _merge_cross_page_tables(tables: list[dict]) -> list[dict]:
    """
    If table[i] on page N has the same column signature as table[i+1] on page N+1,
    they are a continuation — merge rows, keep first caption, update page range.
    """
    if not tables:
        return tables

    merged: list[dict] = [tables[0]]
    for current in tables[1:]:
        prev = merged[-1]
        prev_sig = _col_signature(prev.get("headers", []))
        curr_sig = _col_signature(current.get("headers", []))
        consecutive_pages = current.get("page", 0) - prev.get("page", 0) == 1

        if prev_sig and curr_sig and prev_sig == curr_sig and consecutive_pages:
            # Merge: append rows of current into prev, extend page range
            prev["rows"].extend(current.get("rows", []))
            prev["page_end"] = current.get("page", prev.get("page"))
        else:
            merged.append(current)

    return merged


# ─────────────────────────────────────────────────────────────────────────────
# Image extraction + OCR
# ─────────────────────────────────────────────────────────────────────────────

def _extract_images(
    doc: fitz.Document,
    doc_id: str,
    images_base: Path,
) -> list[dict]:
    images_dir = images_base / doc_id
    images_dir.mkdir(parents=True, exist_ok=True)

    extracted: list[dict] = []

    for page_num, page in enumerate(doc, start=1):
        img_list = page.get_images(full=True)
        for img_idx, img_info in enumerate(img_list):
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                img_bytes = base_image["image"]
                img_ext   = base_image.get("ext", "png")
                width     = base_image.get("width", 0)
                height    = base_image.get("height", 0)

                # Skip tiny images (icons, decorations < 50×50 px)
                if width < 50 or height < 50:
                    continue

                img_filename = f"page{page_num}_img{img_idx}.png"
                img_path     = images_dir / img_filename
                rel_path     = f"images/{doc_id}/{img_filename}"

                # Convert to PNG and save
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                pil_img.save(str(img_path), "PNG")

                # OCR
                ocr_text = ""
                if _TESSERACT_AVAILABLE:
                    try:
                        ocr_text = pytesseract.image_to_string(pil_img).strip()
                    except Exception:
                        ocr_text = ""

                extracted.append({
                    "page":        page_num,
                    "image_index": img_idx,
                    "image_path":  rel_path,
                    "width":       width,
                    "height":      height,
                    "ocr_text":    ocr_text,
                })

            except Exception:
                continue

    return extracted


# ─────────────────────────────────────────────────────────────────────────────
# Link extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_links(doc: fitz.Document, all_page_blocks: list[list[dict]]) -> list[dict]:
    links_out: list[dict] = []

    for page_num, page in enumerate(doc, start=1):
        blocks = all_page_blocks[page_num - 1]
        for link in page.get_links():
            if link.get("kind") != fitz.LINK_URI:
                continue
            url  = link.get("uri", "").strip()
            rect = fitz.Rect(link["from"])

            # Find nearest text block by proximity of bounding box
            best_text  = url
            best_dist  = float("inf")
            for blk in blocks:
                if blk.get("type") != 0:
                    continue
                blk_rect = fitz.Rect(blk["bbox"])
                dist = abs(blk_rect.y0 - rect.y0) + abs(blk_rect.x0 - rect.x0)
                if dist < best_dist:
                    best_dist = dist
                    t         = _block_text(blk)
                    if t:
                        best_text = t[:200]

            if url:
                links_out.append({
                    "page": page_num,
                    "text": best_text,
                    "url":  url,
                })

    return links_out


# ─────────────────────────────────────────────────────────────────────────────
# Table cleaning helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clean_cell(val) -> str:
    """Convert cell value to string, strip whitespace, merge multi-line."""
    if val is None:
        return ""
    s = str(val).strip()
    # Merge multi-line cells
    s = " ".join(s.split("\n"))
    return s.strip()


def _is_header_row(row: list[str]) -> bool:
    """Check if a row looks like a header (all strings, no purely numeric cells)."""
    if not row or all(c == "" for c in row):
        return False
    for cell in row:
        if not cell:
            continue
        # If any cell is purely numeric, it's probably data, not a header
        try:
            float(cell.replace(",", "").replace("%", ""))
            return False
        except ValueError:
            continue
    return True


def _clean_table(raw_rows: list[list]) -> tuple[list[str], list[list[str]]]:
    """Clean extracted table rows: clean cells, drop empty rows, detect headers."""
    # Clean all cells
    cleaned = [[_clean_cell(c) for c in row] for row in raw_rows]
    # Drop rows where all cells are empty
    cleaned = [row for row in cleaned if any(c for c in row)]
    if not cleaned:
        return [], []

    # ── Quality gate: reject false-positive "tables" ─────────────────────
    if not _is_real_table(cleaned):
        return [], []

    # Header detection
    if _is_header_row(cleaned[0]):
        headers = cleaned[0]
        rows = cleaned[1:]
    else:
        col_count = len(cleaned[0])
        headers = [f"Col_{i+1}" for i in range(col_count)]
        rows = cleaned

    return headers, rows


def _is_real_table(rows: list[list[str]]) -> bool:
    """
    Reject false-positive tables that are actually paragraphs / title blocks
    mis-detected by pdfplumber or PyMuPDF.

    Heuristics applied:
    1. Must have >= 1 row.
    2. Reject if > 70% of header cells are empty (fragmented non-table).
    3. Reject if > 75% of all cells are empty.
    4. Reject if average non-empty cell length > 140 chars (prose).
    5. Reject if concatenated header looks like prose (high lowercase ratio).
    """
    if len(rows) < 1:
        return False

    col_count = max(len(r) for r in rows)
    if col_count < 2:
        return False

    # Reject if most header cells are empty
    header = rows[0]
    empty_headers = sum(1 for c in header if not c.strip())
    if col_count > 2 and empty_headers / col_count > 0.7:
        return False

    # Count empty vs total cells
    total_cells = sum(len(r) for r in rows)
    empty_cells = sum(1 for r in rows for c in r if not c.strip())
    if total_cells > 0 and empty_cells / total_cells > 0.75:
        return False

    # Check average cell length of non-empty cells
    non_empty = [c for r in rows for c in r if c.strip()]
    if non_empty:
        avg_len = sum(len(c) for c in non_empty) / len(non_empty)
        # Reject long prose fragments
        if avg_len > 140:
            return False

    # Check if header row is just fragments of a sentence
    joined_header = " ".join(c for c in header if c.strip())
    if joined_header:
        words = joined_header.split()
        if len(words) > 3:
            lc_words = [w for w in words if w[0].islower()]
            if len(lc_words) / len(words) > 0.75:
                return False

    return True


# ─────────────────────────────────────────────────────────────────────────────
# Caption detection (shared by both extraction methods)
# ─────────────────────────────────────────────────────────────────────────────

def _find_caption(page_blocks: list[dict], table_bbox: tuple) -> tuple[str, str]:
    """Find a caption text block immediately above or below a table bounding box."""
    tbl_rect = fitz.Rect(table_bbox)
    caption = ""
    caption_position = ""

    above_candidates: list[tuple[float, str]] = []
    below_candidates: list[tuple[float, str]] = []

    for blk in page_blocks:
        if blk.get("type") != 0:
            continue
        blk_rect = fitz.Rect(blk["bbox"])
        text = _block_text(blk)
        if not text or not CAPTION_RE.search(text):
            continue

        gap_above = tbl_rect.y0 - blk_rect.y1
        gap_below = blk_rect.y0 - tbl_rect.y1

        if 0 <= gap_above <= 40:
            above_candidates.append((gap_above, text))
        elif 0 <= gap_below <= 40:
            below_candidates.append((gap_below, text))

    if above_candidates:
        above_candidates.sort(key=lambda x: x[0])
        caption = above_candidates[0][1]
        caption_position = "above"
    elif below_candidates:
        below_candidates.sort(key=lambda x: x[0])
        caption = below_candidates[0][1]
        caption_position = "below"

    return caption, caption_position


# ─────────────────────────────────────────────────────────────────────────────
# Two-pass table extraction: pdfplumber (primary) + PyMuPDF (fallback)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_tables_two_pass(
    pdf_bytes: bytes,
    fitz_doc: fitz.Document,
    all_page_blocks: list[list[dict]],
) -> list[dict]:
    """
    Pass 1 — pdfplumber lines strategy (primary).
    Pass 2 — pdfplumber text strategy fallback for pages where lines finds none.
    Pass 3 — PyMuPDF fallback for pages where pdfplumber finds none.
    """
    tables_out: list[dict] = []
    page_count = fitz_doc.page_count

    # Track which pages got tables from pdfplumber
    pages_with_tables: set[int] = set()  # 1-indexed page numbers

    # ── Pass 1: pdfplumber lines strategy ────────────────────────────────
    try:
        plumber_doc = pdfplumber.open(io.BytesIO(pdf_bytes))
        for page_idx, plumber_page in enumerate(plumber_doc.pages):
            page_num = page_idx + 1
            page_blocks = all_page_blocks[page_idx]

            raw_tables = None
            try:
                raw_tables = plumber_page.extract_tables(
                    table_settings={
                        "vertical_strategy": "lines",
                        "horizontal_strategy": "lines",
                    }
                )
            except Exception:
                raw_tables = None

            if raw_tables:
                for tbl_raw in raw_tables:
                    if not tbl_raw or len(tbl_raw) < 1:
                        continue

                    headers, rows = _clean_table(tbl_raw)
                    if not headers:
                        continue

                    # Approximate table bbox from pdfplumber page for caption
                    # Use the full page bbox as approximation since pdfplumber
                    # doesn't always give per-table bbox in extract_tables
                    page_bbox = (0, 0, plumber_page.width, plumber_page.height)

                    # Try to get better bbox from find_tables if available
                    try:
                        found = plumber_page.find_tables(
                            table_settings={
                                "vertical_strategy": "lines",
                                "horizontal_strategy": "lines",
                            }
                        )
                        if found:
                            page_bbox = found[0].bbox
                    except Exception:
                        pass

                    caption, caption_position = _find_caption(page_blocks, page_bbox)

                    tables_out.append({
                        "page":              page_num,
                        "page_end":          page_num,
                        "caption":           caption,
                        "caption_position":  caption_position,
                        "headers":           headers,
                        "rows":              rows,
                        "row_count":         len(rows),
                        "col_count":         len(headers),
                        "extraction_method": "pdfplumber",
                    })
                    pages_with_tables.add(page_num)

        # ── Pass 2: pdfplumber text strategy fallback (page-wise) ───────
        for page_idx, plumber_page in enumerate(plumber_doc.pages):
            page_num = page_idx + 1
            if page_num in pages_with_tables:
                continue

            page_blocks = all_page_blocks[page_idx]

            raw_tables = None
            try:
                raw_tables = plumber_page.extract_tables(
                    table_settings={
                        "vertical_strategy": "text",
                        "horizontal_strategy": "text",
                        "min_words_vertical": 3,
                        "min_words_horizontal": 1,
                    }
                )
            except Exception:
                raw_tables = None

            if raw_tables:
                for tbl_raw in raw_tables:
                    if not tbl_raw or len(tbl_raw) < 1:
                        continue

                    headers, rows = _clean_table(tbl_raw)
                    if not headers:
                        continue

                    page_bbox = (0, 0, plumber_page.width, plumber_page.height)

                    try:
                        found = plumber_page.find_tables(
                            table_settings={
                                "vertical_strategy": "text",
                                "horizontal_strategy": "text",
                                "min_words_vertical": 3,
                                "min_words_horizontal": 1,
                            }
                        )
                        if found:
                            page_bbox = found[0].bbox
                    except Exception:
                        pass

                    caption, caption_position = _find_caption(page_blocks, page_bbox)

                    tables_out.append({
                        "page":              page_num,
                        "page_end":          page_num,
                        "caption":           caption,
                        "caption_position":  caption_position,
                        "headers":           headers,
                        "rows":              rows,
                        "row_count":         len(rows),
                        "col_count":         len(headers),
                        "extraction_method": "pdfplumber-text",
                    })
                    pages_with_tables.add(page_num)

        plumber_doc.close()
    except Exception:
        # If pdfplumber fails entirely, all pages will be handled by PyMuPDF fallback
        pass

    # ── Pass 3: PyMuPDF fallback for pages with no pdfplumber tables ─────
    for page_num in range(1, page_count + 1):
        if page_num in pages_with_tables:
            continue

        page = fitz_doc[page_num - 1]
        page_blocks = all_page_blocks[page_num - 1]

        try:
            finder = page.find_tables()
        except Exception:
            continue

        for tbl in finder.tables:
            try:
                extracted = tbl.extract()
            except Exception:
                continue

            if not extracted or len(extracted) < 1:
                continue

            headers, rows = _clean_table(extracted)
            if not headers:
                continue

            caption, caption_position = _find_caption(page_blocks, tbl.bbox)

            tables_out.append({
                "page":              page_num,
                "page_end":          page_num,
                "caption":           caption,
                "caption_position":  caption_position,
                "headers":           headers,
                "rows":              rows,
                "row_count":         len(rows),
                "col_count":         len(headers),
                "extraction_method": "pymupdf",
            })

    # Sort by page number while preserving original insertion order for ties.
    tables_out = [
        t for _, t in sorted(
            enumerate(tables_out),
            key=lambda item: (item[1]["page"], item[0]),
        )
    ]
    return tables_out


# ─────────────────────────────────────────────────────────────────────────────
# Main structurer entry point
# ─────────────────────────────────────────────────────────────────────────────

def structure_document(
    doc_id: str,
    pdf_bytes: bytes,
    filename: str,
    source_url: str | None,
    images_base: Path,
) -> dict:
    """
    Given raw PDF bytes, return the full Maxcavator document schema dict.

    Returns:
        {
          document_id, metadata, sections, tables, images, links, raw_pages
        }
    """
    doc = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
    page_count = doc.page_count

    # ── Collect raw page blocks for every page ─────────────────────────────
    all_page_blocks: list[list[dict]] = []
    raw_pages:       list[dict]       = []
    total_words = 0

    for page_num, page in enumerate(doc, start=1):
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
        all_page_blocks.append(blocks)
        page_text = page.get_text("text")
        raw_pages.append({"page_num": page_num, "text": page_text})
        total_words += len(page_text.split())

    # ── PDF metadata ─────────────────────────────────────────────────────────
    raw_meta    = doc.metadata or {}
    pdf_title   = raw_meta.get("title",  "").strip() or filename
    pdf_author  = raw_meta.get("author", "").strip()

    # Approximate year from creation date string
    creation_str = raw_meta.get("creationDate", "")
    year_match   = re.search(r"(\d{4})", creation_str)
    year         = year_match.group(1) if year_match else ""

    # ── Heading classification across entire doc ───────────────────────────
    headings = _classify_headings(all_page_blocks)  # [(page, bi, text, sz, level)]

    # ── Build sections ────────────────────────────────────────────────────
    sections: list[dict] = []

    # Each "heading" → a section.  Content = all text blocks between this
    # heading and the next heading.
    def _collect_content(
        from_page: int, from_bi: int,
        to_page:   int, to_bi:   int,
    ) -> tuple[str, int, int]:
        """Collect non-heading text between two positions and return (text, pg_start, pg_end)."""
        parts:    list[str] = []
        pg_start: int       = from_page
        pg_end:   int       = from_page

        for pg in range(from_page, min(to_page + 1, page_count + 1)):
            blocks = all_page_blocks[pg - 1]
            start_bi = (from_bi + 1) if pg == from_page else 0
            end_bi   = to_bi         if pg == to_page   else len(blocks)
            for bi in range(start_bi, end_bi):
                blk = blocks[bi]
                if blk.get("type") != 0:
                    continue
                t = _block_text(blk)
                if t:
                    parts.append(t)
                    pg_end = pg

        return ("\n\n".join(parts), pg_start, pg_end)

    # Sort headings by (page, block_index)
    headings_sorted = sorted(headings, key=lambda h: (h[0], h[1]))

    for i, (h_page, h_bi, h_text, h_sz, h_level) in enumerate(headings_sorted):
        # Determine end position
        if i + 1 < len(headings_sorted):
            next_page, next_bi = headings_sorted[i + 1][0], headings_sorted[i + 1][1]
        else:
            next_page, next_bi = page_count, len(all_page_blocks[-1])

        content, sec_start, sec_end = _collect_content(
            h_page, h_bi, next_page, next_bi
        )

        sections.append({
            "heading":    h_text,
            "level":      h_level,
            "page_start": sec_start,
            "page_end":   sec_end,
            "content":    _normalize_section_text(content),
        })

    # If no headings found, treat the whole document as one un-sectioned block
    if not sections:
        full_text = "\n\n".join(p["text"] for p in raw_pages if p["text"].strip())
        sections.append({
            "heading":    pdf_title or "Document",
            "level":      1,
            "page_start": 1,
            "page_end":   page_count,
            "content":    full_text,
        })

    # ── Table extraction (two-pass: pdfplumber + PyMuPDF fallback) ─────
    tables = _extract_tables_two_pass(pdf_bytes, doc, all_page_blocks)
    tables = _merge_cross_page_tables(tables)

    # ── Image extraction + OCR ───────────────────────────────────────────
    images = _extract_images(doc, doc_id, images_base)

    # ── Link extraction ──────────────────────────────────────────────────
    links = _extract_links(doc, all_page_blocks)

    doc.close()

    # ── Assemble final schema ────────────────────────────────────────────
    schema = {
        "document_id": doc_id,
        "filename":    filename,
        "metadata": {
            "title":       pdf_title,
            "author":      pdf_author,
            "year":        year,
            "source_url":  source_url or "",
            "page_count":  page_count,
            "word_count":  total_words,
            "ingested_at": time.time(),
            "section_count": len(sections),
            "table_count":   len(tables),
            "image_count":   len(images),
            "link_count":    len(links),
        },
        "sections":  sections,
        "tables":    tables,
        "images":    images,
        "links":     links,
        "raw_pages": raw_pages,
    }

    return schema
