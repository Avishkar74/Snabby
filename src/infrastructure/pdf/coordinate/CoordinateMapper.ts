import type { PDFFont } from 'pdf-lib';

export interface CoordinateMapResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceImageRect {
  width: number;
  height: number;
}

export interface TargetEmbeddedImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundingBox2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MappedWordBounds {
  pdfX: number;
  pdfYBottom: number;
  pdfWidth: number;
  pdfHeight: number;
}

export interface FontMetricsPlacement {
  fontSize: number;
  descenderMagnitude: number;
  baselineY: number;
  horizontalScale: number;
}

export class CoordinateMapper {
  /**
   * Maps an OCR bounding box from source image pixel space (top-left origin)
   * into the exact target embedded image rectangle in PDF points (bottom-left origin).
   *
   * Transformation:
   * scaleX = target.width / source.width
   * scaleY = target.height / source.height
   * pdfX = target.x + (box.x * scaleX)
   * pdfYBottom = target.y + target.height - ((box.y + box.height) * scaleY)
   */
  public static mapRect(
    box: BoundingBox2D,
    source: SourceImageRect,
    target: TargetEmbeddedImageRect
  ): MappedWordBounds {
    const scaleX = target.width / Math.max(1, source.width);
    const scaleY = target.height / Math.max(1, source.height);

    const pdfX = target.x + (box.x * scaleX);
    const pdfWidth = Math.max(0, box.width * scaleX);
    const pdfHeight = Math.max(0, box.height * scaleY);
    const pdfYBottom = target.y + target.height - ((box.y + box.height) * scaleY);

    return { pdfX, pdfYBottom, pdfWidth, pdfHeight };
  }

  /**
   * Calculates the font size, explicit positive descender magnitude, baseline Y,
   * and horizontal scaling factor using actual PDFFont metrics.
   *
   * Semantics:
   * - fontSize is initialized via font.sizeAtHeight(pdfHeight) as the best metric-based initial mapping.
   * - descenderMagnitude is derived explicitly as (totalHeight - ascenderHeight), ensuring a strictly positive value.
   * - baselineY = pdfYBottom + descenderMagnitude positions the font baseline so the bottom of the glyph box
   *   aligns with pdfYBottom and the top with pdfYBottom + pdfHeight.
   * - horizontalScale (Tz) fits the text width to pdfWidth without clipping word ends or colliding with neighbors.
   */
  public static calculateFontPlacement(
    font: PDFFont,
    text: string,
    pdfWidth: number,
    pdfHeight: number,
    pdfYBottom: number
  ): FontMetricsPlacement {
    // Initial metric-based font size
    const safeHeight = Math.max(1, pdfHeight);
    const fontSize = Math.max(1, font.sizeAtHeight(safeHeight));

    // Derive explicit positive descender magnitude from verified PDFFont height methods
    const totalH = font.heightAtSize(fontSize, { descender: true });
    const ascenderH = font.heightAtSize(fontSize, { descender: false });
    const descenderMagnitude = Math.max(0, totalH - ascenderH);

    const baselineY = pdfYBottom + descenderMagnitude;

    // Horizontal text scaling factor (Tz in PDF, percentage of normal width)
    let horizontalScale = 100;
    if (text.length > 0) {
      try {
        const naturalWidth = font.widthOfTextAtSize(text, fontSize);
        if (naturalWidth > 0 && pdfWidth > 0) {
          horizontalScale = Math.max(10, Math.min(500, (pdfWidth / naturalWidth) * 100));
        }
      } catch {
        horizontalScale = 100;
      }
    }

    return { fontSize, descenderMagnitude, baselineY, horizontalScale };
  }

  /**
   * Legacy 1D-scaled coordinate mapping for backward compatibility.
   */
  public static map(
    x_img: number,
    y_img: number,
    w_img: number,
    h_img: number,
    imageHeight: number,
    imgLeft: number,
    imgBottom: number,
    scale: number
  ): CoordinateMapResult {
    const width = w_img * scale;
    const height = h_img * scale;
    const x = imgLeft + (x_img * scale);
    const y = imgBottom + (imageHeight - y_img - h_img) * scale;
    return { x, y, width, height };
  }
}

