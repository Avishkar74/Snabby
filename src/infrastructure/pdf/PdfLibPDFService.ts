import {
  PDFDocument,
  StandardFonts,
  PDFOperator,
  PDFOperatorNames,
  PDFNumber,
  beginText,
  endText,
  pushGraphicsState,
  popGraphicsState,
  type PDFFont,
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

interface FilteredWord {
  text: string;
  box: { x: number; y: number; width: number; height: number };
}

interface LineCluster {
  minY: number;
  maxY: number;
  words: FilteredWord[];
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

        // 4. Validate OCR Freshness:
        // Only use the OCR text layer when status is COMPLETED and processedImageId matches the effective image.
        const ocrResult = await this.ocrRepo.findByCaptureId(page.id);
        const isOcrFreshAndCompleted =
          ocrResult !== null &&
          ocrResult.status === OCRStatus.COMPLETED &&
          ocrResult.processedImageId === effectiveImageId;

        // Handle valid zero-word completed OCR without errors (e.g. blank custom pages or scribble-only pages)
        if (isOcrFreshAndCompleted && Array.isArray(ocrResult.words) && ocrResult.words.length > 0) {
          // 5. Filter valid non-empty words with positive dimensions
          const validWords: FilteredWord[] = [];
          for (const w of ocrResult.words) {
            if (!w || typeof w !== 'object') continue;
            const box = w.boundingBox;
            if (!box || typeof box.x !== 'number' || typeof box.y !== 'number') continue;
            const rw = typeof box.width === 'number' ? box.width : 0;
            const rh = typeof box.height === 'number' ? box.height : 0;
            if (rw <= 0 || rh <= 0) continue;
            const text = typeof w.text === 'string' ? w.text.trim() : String(w.text || '').trim();
            if (text.length === 0) continue;
            validWords.push({ text, box: { x: box.x, y: box.y, width: rw, height: rh } });
          }

          if (validWords.length > 0) {
            // 6. Cluster words into visual lines using adaptive vertical overlap
            validWords.sort((a, b) => {
              const aCenter = a.box.y + a.box.height / 2;
              const bCenter = b.box.y + b.box.height / 2;
              return aCenter - bCenter;
            });

            const lines: LineCluster[] = [];
            for (const word of validWords) {
              const wTop = word.box.y;
              const wBottom = word.box.y + word.box.height;
              const wHeight = word.box.height;

              let bestLine: LineCluster | null = null;
              let bestOverlapRatio = 0;

              for (const line of lines) {
                const overlapTop = Math.max(wTop, line.minY);
                const overlapBottom = Math.min(wBottom, line.maxY);
                const overlap = overlapBottom - overlapTop;

                if (overlap > 0) {
                  const lineH = line.maxY - line.minY;
                  const minH = Math.min(wHeight, lineH);
                  const ratio = overlap / minH;
                  // Adaptive vertical overlap criterion: significant vertical overlap relative to word/line height
                  if (ratio >= 0.5 && ratio > bestOverlapRatio) {
                    bestOverlapRatio = ratio;
                    bestLine = line;
                  }
                }
              }

              if (bestLine) {
                bestLine.words.push(word);
                bestLine.minY = Math.min(bestLine.minY, wTop);
                bestLine.maxY = Math.max(bestLine.maxY, wBottom);
              } else {
                lines.push({
                  minY: wTop,
                  maxY: wBottom,
                  words: [word],
                });
              }
            }

            // Sort lines top-to-bottom
            lines.sort((a, b) => a.minY - b.minY);

            // Sort words within each line strictly left-to-right (x ascending)
            for (const line of lines) {
              line.words.sort((a, b) => a.box.x - b.box.x);
            }

            // 7. Define explicit source and target rectangles
            const sourceRect = {
              width: ocrResult.imageWidth || imageWidth,
              height: ocrResult.imageHeight || imageHeight,
            };
            const targetRect = {
              x: imgLeft,
              y: imgBottom,
              width: renderedWidth,
              height: renderedHeight,
            };

            const scaleX = targetRect.width / Math.max(1, sourceRect.width);
            const scaleY = targetRect.height / Math.max(1, sourceRect.height);

            // Ensure font is registered in the page dictionary to obtain the font resource key
            pdfPage.setFont(helveticaFont);
            const fontName = pdfPage.node.newFontDictionary(helveticaFont.name, helveticaFont.ref);

            // 8. Emit invisible selectable text operators with unified line baseline and line font size
            for (const line of lines) {
              // Calculate unified line vertical bounds in PDF coordinate space
              const linePdfYBottom = targetRect.y + targetRect.height - (line.maxY * scaleY);
              const linePdfHeight = Math.max(1, (line.maxY - line.minY) * scaleY);
              const lineFontSize = Math.max(1, helveticaFont.sizeAtHeight(linePdfHeight));

              const totalH = helveticaFont.heightAtSize(lineFontSize, { descender: true });
              const ascenderH = helveticaFont.heightAtSize(lineFontSize, { descender: false });
              const descenderMagnitude = Math.max(0, totalH - ascenderH);
              const lineBaselineY = linePdfYBottom + descenderMagnitude;

              const lineOps: PDFOperator[] = [
                pushGraphicsState(),
                beginText(),
                PDFOperator.of(PDFOperatorNames.SetTextRenderingMode, [PDFNumber.of(3)]), // 3 = invisible text
                PDFOperator.of(PDFOperatorNames.SetFontAndSize, [fontName, PDFNumber.of(lineFontSize)]),
              ];

              let hasEmittedWords = false;

              for (const word of line.words) {
                // Unicode safety: skip invisible text overlay for this word if font cannot encode it
                if (!canEncodeText(helveticaFont, word.text)) {
                  continue;
                }

                const wordPdfX = targetRect.x + (word.box.x * scaleX);
                const wordPdfWidth = Math.max(0, word.box.width * scaleX);
                if (wordPdfWidth <= 0) {
                  continue;
                }

                let horizontalScale = 100;
                try {
                  const naturalWidth = helveticaFont.widthOfTextAtSize(word.text, lineFontSize);
                  if (naturalWidth > 0 && wordPdfWidth > 0) {
                    horizontalScale = Math.max(10, Math.min(500, (wordPdfWidth / naturalWidth) * 100));
                  }
                } catch {
                  horizontalScale = 100;
                }

                lineOps.push(
                  PDFOperator.of(PDFOperatorNames.SetTextHorizontalScaling, [PDFNumber.of(horizontalScale)]),
                  PDFOperator.of(PDFOperatorNames.SetTextMatrix, [
                    PDFNumber.of(1),
                    PDFNumber.of(0),
                    PDFNumber.of(0),
                    PDFNumber.of(1),
                    PDFNumber.of(wordPdfX),
                    PDFNumber.of(lineBaselineY),
                  ]),
                  PDFOperator.of(PDFOperatorNames.ShowText, [helveticaFont.encodeText(word.text)])
                );

                hasEmittedWords = true;
              }

              if (hasEmittedWords) {
                lineOps.push(endText(), popGraphicsState());
                pdfPage.pushOperators(...lineOps);
              }
            }
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

