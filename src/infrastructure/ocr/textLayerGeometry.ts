/**
 * Shared OCR text-layer geometry.
 *
 * Both the searchable-PDF text layer (`PdfLibPDFService`) and the on-screen
 * selectable overlay (`OCRTextOverlay`) consume this module so their geometry
 * can never drift apart.
 *
 * Everything here works purely in **source-image pixel space** (the exact pixels
 * Tesseract processed, i.e. `OCRResult.imageWidth × OCRResult.imageHeight`,
 * top-left origin, y increasing downward). Each consumer is responsible for
 * scaling into its own target space (PDF points / rendered CSS pixels) and for
 * flipping the Y axis if required.
 *
 * Pipeline:
 *   words
 *     └─ filter degenerate boxes
 *     └─ segment into layout regions (recursive XY-cut: columns / stacked
 *        blocks) so a multi-column screenshot selects one column at a time
 *        instead of zig-zagging between columns
 *     └─ within each region: cluster words into visual lines, order L→R
 *     └─ emit regions in reading order (top→bottom, left→right)
 *
 * The design goals, in priority order:
 *   1. Reading order / region isolation — selecting part of one column must not
 *      pull in words from the neighbouring column.
 *   2. Per-word horizontal fitting — the invisible glyph run for a word must
 *      occupy the same horizontal extent as its OCR box (via
 *      `horizontalScalePercent`), so selection never drifts across a line.
 *   3. Sane font size — from the representative glyph height of the line, never
 *      the full bounding-box height.
 */

export interface GeomBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeomWordInput {
  text: string;
  boundingBox: GeomBox;
  confidence?: number;
}

export interface GeomWord {
  text: string;
  /** left edge, source-image px */
  x: number;
  /** OCR box width, source-image px */
  width: number;
  /** OCR box top, source-image px */
  y: number;
  /** OCR box height, source-image px */
  height: number;
  /** Tesseract confidence 0-100 (100 when the input omitted it) */
  confidence: number;
}

export interface GeomLine {
  /** top of the line cluster, source-image px */
  top: number;
  /** bottom of the line cluster, source-image px */
  bottom: number;
  /** bottom - top */
  height: number;
  /**
   * Representative glyph height (ascender-to-descender extent) for the line,
   * in source-image px. Feed this to `font.sizeAtHeight()` (PDF) or divide by
   * the font's line-height ratio (DOM) to get a font size.
   */
  fontHeight: number;
  /**
   * Estimated text baseline of the line, measured from the source-image top
   * (y increases downward), in px.
   */
  baselineFromTop: number;
  /** words on this line, ordered strictly left-to-right */
  words: GeomWord[];
}

export interface GeomRegion {
  /** bounding box of the region in source-image px */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** visual lines of this region, ordered top-to-bottom */
  lines: GeomLine[];
}

export interface ClusterOptions {
  /**
   * Minimum vertical-overlap ratio (overlap / min(wordHeight, lineHeight))
   * required to merge a word into an existing line. Default 0.35.
   */
  overlapRatio?: number;
  /**
   * Fraction of the representative glyph height that sits below the baseline
   * (the descender). Used to place `baselineFromTop`. Default 0.18.
   */
  descenderFraction?: number;
  /**
   * Disable layout segmentation (treat all words as one region). Mainly for
   * tests / simple single-column inputs.
   */
  disableSegmentation?: boolean;
  /**
   * Words below this Tesseract confidence are dropped outright as noise
   * (typically OCR misfires over photos / icons). Words with no confidence
   * value are always kept. Default 30.
   */
  minConfidence?: number;
}

const DEFAULT_OVERLAP_RATIO = 0.35;
const DEFAULT_DESCENDER_FRACTION = 0.18;

// Confidence gates. Real body text scores ~80-99; OCR noise over images/icons
// scores near 0. A hard floor removes the worst; then, per line, we drop:
//  - a not-rock-solid word whose height is a strong outlier for its line
//    (a stray tall/tiny mark from a photo or rule), and
//  - a medium-confidence word that sits well outside the horizontal span of the
//    line's real text, and
//  - a line that is, as a whole, low confidence.
const DEFAULT_MIN_CONFIDENCE = 30;
const CORE_CONFIDENCE = 55;
const SOLID_CONFIDENCE = 92;
const LINE_MIN_MEDIAN_CONFIDENCE = 45;
const HEIGHT_OUTLIER_HI = 1.55;
const HEIGHT_OUTLIER_LO = 0.55;
const NO_CONFIDENCE = 100;

// A single line's representative glyph height is clamped to this band around the
// document-wide median, so a Tesseract box-merge error (e.g. a label glued to
// the control below it) cannot blow up the font size of one selection line.
const LINE_FONT_HEIGHT_MAX_RATIO = 2.2;
const LINE_FONT_HEIGHT_MIN_RATIO = 0.5;

// XY-cut tuning. Gap thresholds are the larger of an absolute pixel floor and a
// multiple of the median word height, so they scale with the screenshot's DPI.
const COLUMN_GUTTER_MIN_PX = 22;
const COLUMN_GUTTER_MIN_EM = 1.5;
const BLOCK_GAP_MIN_PX = 16;
const BLOCK_GAP_MIN_EM = 1.3;
const XY_CUT_MAX_DEPTH = 4;
const XY_CUT_MIN_WORDS = 8;
const XY_CUT_MIN_SIDE_WORDS = 4;
// A column gutter may be crossed by a little OCR noise; allow a low, non-zero
// coverage inside it. Horizontal band gaps must be truly empty.
const COLUMN_GUTTER_MAX_COVERAGE = 2;
// A real column runs most of its band's height — reject a "split" that only
// shaves a sliver off one side.
const COLUMN_MIN_HEIGHT_FRACTION = 0.5;
const PROFILE_BIN_PX = 2;

/**
 * Ratio of a line's **median OCR word-box height** to the underlying CSS
 * `font-size`. Tesseract word boxes are the tight glyph extent and a line's
 * median is dominated by words without ascenders/descenders, so the box runs
 * roughly 0.75–0.8 of the em. DOM/PDF consumers divide `fontHeight` by this to
 * recover an approximate font size.
 */
export const OCR_BOX_TO_FONT_SIZE_RATIO = 0.78;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor((sortedAsc.length - 1) / 2);
  return sortedAsc[mid];
}

type InternalWord = GeomWord;

interface InternalCluster {
  top: number;
  bottom: number;
  words: InternalWord[];
}

function filterWords(
  words: readonly GeomWordInput[] | null | undefined,
  minConfidence: number,
): InternalWord[] {
  const valid: InternalWord[] = [];
  for (const w of words ?? []) {
    if (!w || typeof w !== 'object') continue;
    const b = w.boundingBox;
    if (!b) continue;
    const { x, y, width, height } = b;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) continue;
    if (width <= 0 || height <= 0) continue;
    const raw = typeof w.text === 'string' ? w.text : String(w.text ?? '');
    const text = raw.trim();
    if (text.length === 0) continue;
    const confidence = isFiniteNumber(w.confidence) ? w.confidence : NO_CONFIDENCE;
    if (confidence < minConfidence) continue;
    valid.push({ text, x, y, width, height, confidence });
  }
  return valid;
}

/**
 * Removes noise words that survived the confidence floor: within a clustered
 * line, a medium-confidence word that sits well outside the horizontal span of
 * the line's confident words (a stray mark beside a photo). Also drops a line
 * whose words are, as a whole, low confidence.
 *
 * Returns the surviving words, or `null` if the whole line is noise.
 */
function pruneLineNoise(words: InternalWord[]): InternalWord[] | null {
  if (words.length === 0) return null;
  if (words.length === 1) {
    return words[0].confidence >= LINE_MIN_MEDIAN_CONFIDENCE ? words : null;
  }

  const medianConf = median(words.map((w) => w.confidence).sort((a, b) => a - b));

  // Anchor on confident, normally-sized words — that is "the real text" of the line.
  const lineMedianH = Math.max(1, median(words.map((w) => w.height).sort((a, b) => a - b)));
  const anchors = words.filter(
    (w) =>
      w.confidence >= CORE_CONFIDENCE &&
      w.height <= lineMedianH * HEIGHT_OUTLIER_HI &&
      w.height >= lineMedianH * HEIGHT_OUTLIER_LO,
  );

  if (anchors.length === 0) {
    return medianConf >= LINE_MIN_MEDIAN_CONFIDENCE ? words : null;
  }

  const refH = Math.max(1, median(anchors.map((w) => w.height).sort((a, b) => a - b)));
  const coreLeft = Math.min(...anchors.map((w) => w.x));
  const coreRight = Math.max(...anchors.map((w) => w.x + w.width));
  const margin = refH * 1.5;

  const kept = words.filter((w) => {
    const ratio = w.height / refH;
    const heightOutlier = ratio > HEIGHT_OUTLIER_HI || ratio < HEIGHT_OUTLIER_LO;
    if (heightOutlier && w.confidence < SOLID_CONFIDENCE) return false;
    if (w.confidence >= CORE_CONFIDENCE) return true;
    const outsideLeft = w.x + w.width < coreLeft - margin;
    const outsideRight = w.x > coreRight + margin;
    return !(outsideLeft || outsideRight);
  });

  return kept.length > 0 ? kept : null;
}

function medianWordHeight(words: InternalWord[]): number {
  if (words.length === 0) return 12;
  const hs = words.map((w) => w.height).sort((a, b) => a - b);
  return Math.max(1, median(hs));
}

/**
 * Whitespace / low-coverage gaps along one axis of a word set, found from a
 * coverage histogram. Returns interior gap centres, sorted ascending, for gaps
 * at least `minGap` wide where no more than `maxCoverage` word boxes overlap.
 *
 * `maxCoverage = 0` finds only truly empty bands; a small positive value lets a
 * column gutter survive a few stray OCR boxes that overreach into it.
 */
function coverageCuts(
  words: InternalWord[],
  axis: 'x' | 'y',
  minGap: number,
  maxCoverage: number,
): number[] {
  if (words.length < 2) return [];

  let lo = Infinity;
  let hi = -Infinity;
  for (const w of words) {
    const a = axis === 'x' ? w.x : w.y;
    const b = axis === 'x' ? w.x + w.width : w.y + w.height;
    if (a < lo) lo = a;
    if (b > hi) hi = b;
  }
  const span = hi - lo;
  if (!(span > 0)) return [];

  const n = Math.max(1, Math.ceil(span / PROFILE_BIN_PX));
  const hist = new Array<number>(n).fill(0);
  for (const w of words) {
    const a = axis === 'x' ? w.x : w.y;
    const b = axis === 'x' ? w.x + w.width : w.y + w.height;
    const i0 = Math.max(0, Math.floor((a - lo) / PROFILE_BIN_PX));
    const i1 = Math.min(n, Math.ceil((b - lo) / PROFILE_BIN_PX));
    for (let i = i0; i < i1; i++) hist[i]++;
  }

  const minBins = Math.max(1, Math.ceil(minGap / PROFILE_BIN_PX));
  const cuts: number[] = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const isGap = i < n && hist[i] <= maxCoverage;
    if (isGap) {
      if (runStart < 0) runStart = i;
    } else {
      // Ignore leading (runStart === 0) and trailing (i === n) whitespace —
      // those are just the region's own margins, not internal separators.
      if (runStart > 0 && i < n && i - runStart >= minBins) {
        cuts.push(lo + ((runStart + i) / 2) * PROFILE_BIN_PX);
      }
      runStart = -1;
    }
  }
  return cuts;
}

function splitAtCuts(words: InternalWord[], axis: 'x' | 'y', cuts: number[]): InternalWord[][] {
  const sortedCuts = [...cuts].sort((a, b) => a - b);
  const groups: InternalWord[][] = sortedCuts.map(() => []);
  groups.push([]);
  for (const w of words) {
    const centre = axis === 'x' ? w.x + w.width / 2 : w.y + w.height / 2;
    let idx = 0;
    while (idx < sortedCuts.length && centre >= sortedCuts[idx]) idx++;
    groups[idx].push(w);
  }
  return groups.filter((g) => g.length > 0);
}

function ySpan(words: InternalWord[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const w of words) {
    if (w.y < lo) lo = w.y;
    if (w.y + w.height > hi) hi = w.y + w.height;
  }
  return hi > lo ? hi - lo : 0;
}

/**
 * Recursive XY-cut. Splits a word set into layout regions along whitespace
 * gutters (vertical first — columns dominate reading order — then horizontal
 * bands). Returns leaf regions already in reading order.
 */
function segmentRegions(words: InternalWord[], medianH: number, depth = 0): InternalWord[][] {
  if (depth >= XY_CUT_MAX_DEPTH || words.length < XY_CUT_MIN_WORDS) return [words];

  const columnGutter = Math.max(COLUMN_GUTTER_MIN_PX, COLUMN_GUTTER_MIN_EM * medianH);
  const blockGap = Math.max(BLOCK_GAP_MIN_PX, BLOCK_GAP_MIN_EM * medianH);

  // 1. Horizontal bands -> stacked blocks (processed top-to-bottom). Done first
  //    so a full-width header / footer / section rule is peeled off before we
  //    look for columns (otherwise a full-width row bridges the column gutter).
  //    Must be a genuinely empty band.
  const hCuts = coverageCuts(words, 'y', blockGap, 0);
  if (hCuts.length > 0) {
    const bands = splitAtCuts(words, 'y', hCuts);
    if (bands.length > 1) {
      return bands.flatMap((b) => segmentRegions(b, medianH, depth + 1));
    }
  }

  // 2. Vertical gutters -> columns (processed left-to-right). Tolerates a little
  //    OCR noise inside the gutter. Guarded so a ragged edge cannot shave a
  //    sliver off a single column.
  const vCuts = coverageCuts(words, 'x', columnGutter, COLUMN_GUTTER_MAX_COVERAGE);
  if (vCuts.length > 0) {
    const cols = splitAtCuts(words, 'x', vCuts);
    const parentHeight = ySpan(words);
    const columnsLookReal =
      cols.length > 1 &&
      cols.every((c) => c.length >= XY_CUT_MIN_SIDE_WORDS) &&
      cols.every((c) => ySpan(c) >= parentHeight * COLUMN_MIN_HEIGHT_FRACTION);
    if (columnsLookReal) {
      return cols.flatMap((c) => segmentRegions(c, medianH, depth + 1));
    }
  }

  return [words];
}

function boundsOf(words: InternalWord[]): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const w of words) {
    if (w.x < left) left = w.x;
    if (w.y < top) top = w.y;
    if (w.x + w.width > right) right = w.x + w.width;
    if (w.y + w.height > bottom) bottom = w.y + w.height;
  }
  return { left, top, right, bottom };
}

/**
 * Groups an already-filtered word set into visual lines (single region).
 * Lines ordered top-to-bottom; words within a line ordered left-to-right.
 */
function clusterLines(
  valid: InternalWord[],
  overlapRatio: number,
  descenderFraction: number,
  docMedianHeight: number,
): GeomLine[] {
  if (valid.length === 0) return [];

  const ordered = [...valid].sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));

  const clusters: InternalCluster[] = [];
  for (const w of ordered) {
    const wTop = w.y;
    const wBottom = w.y + w.height;
    const wCenter = w.y + w.height / 2;

    let best: InternalCluster | null = null;
    let bestScore = 0;
    for (const c of clusters) {
      const overlap = Math.min(wBottom, c.bottom) - Math.max(wTop, c.top);
      if (overlap <= 0) continue;
      const clusterHeight = c.bottom - c.top;
      const denom = Math.min(w.height, clusterHeight) || 1;
      const ratio = overlap / denom;
      const band = clusterHeight * 0.6;
      const centreInside = wCenter >= c.top - band && wCenter <= c.bottom + band;
      if (ratio >= overlapRatio && centreInside && ratio > bestScore) {
        bestScore = ratio;
        best = c;
      }
    }

    if (best) {
      best.words.push(w);
      best.top = Math.min(best.top, wTop);
      best.bottom = Math.max(best.bottom, wBottom);
    } else {
      clusters.push({ top: wTop, bottom: wBottom, words: [w] });
    }
  }

  clusters.sort((a, b) => a.top - b.top);

  const lines: GeomLine[] = [];
  for (const c of clusters) {
    const pruned = pruneLineNoise(c.words);
    if (!pruned || pruned.length === 0) continue;

    pruned.sort((a, b) => a.x - b.x);

    const top = Math.min(...pruned.map((w) => w.y));
    const bottom = Math.max(...pruned.map((w) => w.y + w.height));
    const heightsAsc = pruned.map((w) => w.height).sort((a, b) => a - b);
    const bottomsAsc = pruned.map((w) => w.y + w.height).sort((a, b) => a - b);
    const rawFontHeight = Math.max(1, median(heightsAsc));
    const fontHeight = Math.min(
      docMedianHeight * LINE_FONT_HEIGHT_MAX_RATIO,
      Math.max(docMedianHeight * LINE_FONT_HEIGHT_MIN_RATIO, rawFontHeight),
    );
    const medianBottom = median(bottomsAsc);
    const baselineFromTop = medianBottom - fontHeight * descenderFraction;

    lines.push({
      top,
      bottom,
      height: bottom - top,
      fontHeight,
      baselineFromTop,
      words: pruned.map((w) => ({
        text: w.text,
        x: w.x,
        width: w.width,
        y: w.y,
        height: w.height,
        confidence: w.confidence,
      })),
    });
  }
  return lines;
}

/**
 * Filters and segments OCR words into layout regions, each with its own visual
 * lines. Regions are returned in reading order. Consumers that care about
 * selection isolation (the DOM overlay) should render one container per region.
 */
export function clusterOcrRegions(
  words: readonly GeomWordInput[] | null | undefined,
  opts: ClusterOptions = {},
): GeomRegion[] {
  const overlapRatio = opts.overlapRatio ?? DEFAULT_OVERLAP_RATIO;
  const descenderFraction = opts.descenderFraction ?? DEFAULT_DESCENDER_FRACTION;
  const minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  const valid = filterWords(words, minConfidence);
  if (valid.length === 0) return [];

  const medianH = medianWordHeight(valid);
  const groups = opts.disableSegmentation ? [valid] : segmentRegions(valid, medianH);

  const regions: GeomRegion[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    const lines = clusterLines(group, overlapRatio, descenderFraction, medianH);
    if (lines.length === 0) continue;
    // Region bounds from the words that actually survived line-level pruning.
    const survivors = lines.flatMap((l) => l.words);
    const b = boundsOf(survivors);
    regions.push({ ...b, lines });
  }
  return regions;
}

/**
 * Filters, groups and orders OCR words into visual lines (flattened across all
 * layout regions, in reading order). Kept for consumers that do not need the
 * region grouping.
 */
export function clusterOcrLines(
  words: readonly GeomWordInput[] | null | undefined,
  opts: ClusterOptions = {},
): GeomLine[] {
  return clusterOcrRegions(words, opts).flatMap((r) => r.lines);
}

/**
 * Horizontal scaling factor (as a percentage, PDF `Tz` semantics) that makes a
 * text run of natural width `naturalWidth` occupy exactly `targetWidth`.
 * Clamped to a sane range; returns 100 when inputs are unusable.
 */
export function horizontalScalePercent(
  targetWidth: number,
  naturalWidth: number,
  min = 10,
  max = 1000,
): number {
  if (!(naturalWidth > 0) || !(targetWidth > 0)) return 100;
  return Math.max(min, Math.min(max, (targetWidth / naturalWidth) * 100));
}
