import {
  PDFDocument,
  StandardFonts,
  PDFOperator,
  PDFOperatorNames,
  PDFNumber,
  pushGraphicsState,
  popGraphicsState,
  beginText,
  endText,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { PDFService } from '../../application/interfaces/services/PDFService.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { Page } from '../../domain/page/Page.ts';
import type { IPageProps } from '../../domain/page/page.types.ts';
import type { ImageId } from '../../domain/common/ids.ts';
import type { ImageRepository } from '../../application/interfaces/repositories/ImageRepository.ts';
import type { OCRRepository } from '../../application/interfaces/repositories/OCRRepository.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';
import { PDFGenerationError } from '../../application/pdf/errors.ts';
import {
  clusterOcrLines,
  horizontalScalePercent,
  OCR_BOX_TO_FONT_SIZE_RATIO,
} from '../ocr/textLayerGeometry.ts';

/**
 * Strongly typed helper to resolve the effective image ID for a page.
 * Supports both Page class instances with prototype getters and plain deserialized objects.
 */
export function resolveEffectiveImageId(page: Page | IPageProps): ImageId | undefined {
  if (
    'effectiveRenderedImageId' in page &&
    typeof page.effectiveRenderedImageId === 'string' &&
    page.effectiveRenderedImageId
  ) {
    return page.effectiveRenderedImageId;
  }
  return (page.renderedImageId ?? page.imageId) ?? undefined;
}

/**
 * Checks if the embedded font can encode the text without throwing an encoding error.
 */
function canEncodeText(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

export class PdfLibPDFService implements PDFService {
  private imageRepo: ImageRepository;
  private ocrRepo: OCRRepository;

  constructor(imageRepo: ImageRepository, ocrRepo: OCRRepository) {
    this.imageRepo = imageRepo;
    this.ocrRepo = ocrRepo;
  }

  public async generate(session: Session, pages: Page[]): Promise<Blob> {
    try {
      const pdfDoc = await PDFDocument.create();

      // Set PDF Metadata
      pdfDoc.setTitle(session.name || `Snabby Session ${session.id}`);

      // Helvetica standard font is used for the invisible text overlay
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const page of pages) {
        // 1. Resolve effective image ID with defensive fallback for plain objects
        const effectiveImageId = resolveEffectiveImageId(page);
        if (!effectiveImageId) {
          throw new Error(`No image ID associated with page: ${page.id}`);
        }

        const imageAsset = await this.imageRepo.findById(effectiveImageId);
        if (!imageAsset) {
          throw new Error(`Screenshot image not found in DB for page: ${page.id} (imageId: ${effectiveImageId})`);
        }

        const imageBytes = await imageAsset.data.arrayBuffer();

        // 2. Embed image (supporting both PNG and JPG format check)
        let embeddedImage;
        const contentType = imageAsset.data.type;
        if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
          embeddedImage = await pdfDoc.embedJpg(imageBytes);
        } else {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        }

        const { width: imageWidth, height: imageHeight } = embeddedImage;

        // Add a 10 points white border around the image
        const margin = 10;
        const pageWidth = imageWidth + margin * 2;
        const pageHeight = imageHeight + margin * 2;

        const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

        // Image is drawn at natural pixel size (scale = 1.0).
        const renderedWidth = imageWidth;
        const renderedHeight = imageHeight;
        const imgLeft = margin;
        const imgBottom = margin;

        // 3. Draw the screenshot image (centered with a white margin)
        pdfPage.drawImage(embeddedImage, {
          x: imgLeft,
          y: imgBottom,
          width: renderedWidth,
          height: renderedHeight,
        });

        // 4. Validate OCR freshness. Only overlay a text layer when the OCR was
        // run against the exact image we just embedded.
        const ocrResult = await this.ocrRepo.findByCaptureId(page.id);
        const isOcrFreshAndCompleted =
          ocrResult !== null &&
          ocrResult.status === OCRStatus.COMPLETED &&
          (
            ocrResult.processedImageId === effectiveImageId ||
            // Legacy: accept unversioned OCR if page was never edited (original screenshot)
            (!ocrResult.processedImageId && effectiveImageId === (page.imageId ?? effectiveImageId))
          );

        if (
          isOcrFreshAndCompleted &&
          Array.isArray(ocrResult.words) &&
          ocrResult.words.length > 0
        ) {
          this.drawOcrTextLayer(
            pdfPage,
            helveticaFont,
            ocrResult.words,
            {
              srcWidth: ocrResult.imageWidth > 0 ? ocrResult.imageWidth : imageWidth,
              srcHeight: ocrResult.imageHeight > 0 ? ocrResult.imageHeight : imageHeight,
              targetWidth: renderedWidth,
              targetHeight: renderedHeight,
              targetLeft: imgLeft,
              targetBottom: imgBottom,
            },
          );
        }
      }

      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    } catch (err: any) {
      throw new PDFGenerationError(err.message || String(err), err);
    }
  }

  /**
   * Emits an invisible, selectable OCR text layer over the embedded screenshot.
   *
   * OCR word boxes are in source-image pixel space (top-left origin). The PDF
   * page uses points with a bottom-left origin. Words are clustered into lines
   * (shared geometry with the preview overlay); each line is drawn with a single
   * font size and each word is horizontally scaled (`Tz`) so its glyph run
   * occupies exactly the width of the OCR box. Text render mode 3 keeps the
   * layer invisible but selectable/searchable.
   */
  private drawOcrTextLayer(
    pdfPage: PDFPage,
    font: PDFFont,
    words: ReadonlyArray<{ text: string; boundingBox: { x: number; y: number; width: number; height: number } }>,
    rect: {
      srcWidth: number;
      srcHeight: number;
      targetWidth: number;
      targetHeight: number;
      targetLeft: number;
      targetBottom: number;
    },
  ): void {
    const lines = clusterOcrLines(words);
    if (lines.length === 0) return;

    const scaleX = rect.targetWidth / Math.max(1, rect.srcWidth);
    const scaleY = rect.targetHeight / Math.max(1, rect.srcHeight);

    // Register the font in the page's resource dictionary and grab its key.
    const fontKey = pdfPage.node.newFontDictionary(font.name, font.ref);

    for (const line of lines) {
      // Recover an approximate CSS font size from the tight OCR box height.
      const fontSize = Math.max(1, (line.fontHeight / OCR_BOX_TO_FONT_SIZE_RATIO) * scaleY);

      // Flip Y: source top-left -> PDF bottom-left. `baselineFromTop` is measured
      // from the top of the source image.
      const baselineY =
        rect.targetBottom + (rect.srcHeight - line.baselineFromTop) * scaleY;

      const ops: PDFOperator[] = [
        pushGraphicsState(),
        beginText(),
        // 3 = invisible text render mode (selectable + searchable, not painted)
        PDFOperator.of(PDFOperatorNames.SetTextRenderingMode, [PDFNumber.of(3)]),
        PDFOperator.of(PDFOperatorNames.SetFontAndSize, [fontKey, PDFNumber.of(fontSize)]),
      ];

      let emitted = false;
      for (const word of line.words) {
        if (!canEncodeText(font, word.text)) continue;
        const targetWordWidth = Math.max(0, word.width * scaleX);
        if (targetWordWidth <= 0) continue;

        let naturalWidth = 0;
        try {
          naturalWidth = font.widthOfTextAtSize(word.text, fontSize);
        } catch {
          /* unencodable glyphs already filtered; treat as no-scale */
        }
        const tz = horizontalScalePercent(targetWordWidth, naturalWidth, 10, 1000);
        const xPt = rect.targetLeft + word.x * scaleX;

        ops.push(
          PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(tz)]),
          PDFOperator.of(PDFOperatorNames.SetTextMatrix, [
            PDFNumber.of(1),
            PDFNumber.of(0),
            PDFNumber.of(0),
            PDFNumber.of(1),
            PDFNumber.of(xPt),
            PDFNumber.of(baselineY),
          ]),
          PDFOperator.of(PDFOperatorNames.ShowText, [font.encodeText(word.text)]),
        );
        emitted = true;
      }

      if (emitted) {
        ops.push(endText(), popGraphicsState());
        pdfPage.pushOperators(...ops);
      }
    }
  }
}
