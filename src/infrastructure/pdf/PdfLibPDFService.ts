import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import type { PDFService } from '../../application/interfaces/services/PDFService.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { Page } from '../../domain/page/Page.ts';
import type { IPageProps } from '../../domain/page/page.types.ts';
import type { ImageId } from '../../domain/common/ids.ts';
import type { ImageRepository } from '../../application/interfaces/repositories/ImageRepository.ts';
import type { OCRRepository } from '../../application/interfaces/repositories/OCRRepository.ts';
import { OCRStatus } from '../../domain/ocr/ocr.types.ts';
import { PDFGenerationError } from '../../application/pdf/errors.ts';

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
        // OCR Tesseract always runs on the exact same blob embedded here,
        // so ocrResult.imageWidth === imageWidth and ocrResult.imageHeight === imageHeight.
        const scale = 1.0;
        const renderedWidth = imageWidth * scale;
        const renderedHeight = imageHeight * scale;
        const imgLeft = margin;
        const imgBottom = margin;

        // 3. Draw the screenshot image (centered with a white margin)
        pdfPage.drawImage(embeddedImage, {
          x: imgLeft,
          y: imgBottom,
          width: renderedWidth,
          height: renderedHeight,
        });

        // 4. Validate OCR Freshness:
        // Only use the OCR text layer when status is COMPLETED and processedImageId matches the effective image.
        const ocrResult = await this.ocrRepo.findByCaptureId(page.id);
        const isOcrFreshAndCompleted =
          ocrResult !== null &&
          ocrResult.status === OCRStatus.COMPLETED &&
          (
            ocrResult.processedImageId === effectiveImageId ||
            // Legacy: accept unversioned OCR if page was never edited (original screenshot)
            (!ocrResult.processedImageId && effectiveImageId === (page.imageId ?? effectiveImageId))
          );

        // Handle valid zero-word completed OCR without errors (e.g. blank custom pages or scribble-only pages)
        if (isOcrFreshAndCompleted && Array.isArray(ocrResult.words) && ocrResult.words.length > 0) {
          // 5. Use the OCR imageHeight as the Y-flip anchor.
          // This is the natural pixel height of the image Tesseract processed.
          const ocrImageHeight = (ocrResult.imageHeight > 0) ? ocrResult.imageHeight : imageHeight;

          for (const word of ocrResult.words) {
            const box = word.boundingBox;
            if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') continue;
            const bw = typeof box.width === 'number' ? box.width : 0;
            const bh = typeof box.height === 'number' ? box.height : 0;
            if (bw <= 0 || bh <= 0) continue;

            const text = typeof word.text === 'string' ? word.text.trim() : String(word.text || '').trim();
            if (!text || !canEncodeText(helveticaFont, text)) continue;

            // === Proven main-branch coordinate formula ===
            //
            // OCR space: top-left origin, Y increases downward
            // PDF space: bottom-left origin, Y increases upward
            //
            // pdfX   = imgLeft + x * scale
            // pdfY   = imgBottom + (ocrImageHeight - y - h) * scale  ← flip Y
            // size   = h * scale                                       ← font size = word height
            const pdfX = imgLeft + box.x * scale;
            const pdfY = imgBottom + (ocrImageHeight - box.y - bh) * scale;
            const fontSize = Math.max(1, bh * scale);

            pdfPage.drawText(text, {
              x: pdfX,
              y: pdfY,
              size: fontSize,
              font: helveticaFont,
              color: rgb(0, 0, 0),
              opacity: 0,
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    } catch (err: any) {
      throw new PDFGenerationError(err.message || String(err), err);
    }
  }
}
