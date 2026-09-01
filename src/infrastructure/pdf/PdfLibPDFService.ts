import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFService } from '../../application/interfaces/services/PDFService.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { Page } from '../../domain/page/Page.ts';
import type { ImageRepository } from '../../application/interfaces/repositories/ImageRepository.ts';
import type { OCRRepository } from '../../application/interfaces/repositories/OCRRepository.ts';
import { CoordinateMapper } from './coordinate/CoordinateMapper.ts';
import { PDFGenerationError } from '../../application/pdf/errors.ts';

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
        // 1. Load raw screenshot image data
        const imageAsset = await this.imageRepo.findById(page.effectiveRenderedImageId);
        if (!imageAsset) {
          throw new Error(`Screenshot image not found in DB for page: ${page.id}`);
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

        const scale = 1.0;
        const renderedWidth = imageWidth;
        const renderedHeight = imageHeight;
        const imgLeft = margin;
        const imgBottom = margin;

        // 5. Draw the screenshot image (centered with a white margin)
        pdfPage.drawImage(embeddedImage, {
          x: imgLeft,
          y: imgBottom,
          width: renderedWidth,
          height: renderedHeight,
        });

        // 6. Draw invisible selectable OCR text overlay if available
        const ocrResult = await this.ocrRepo.findByCaptureId(page.id);
        if (ocrResult && ocrResult.words.length > 0) {
          for (const word of ocrResult.words) {
            // Transform top-left image coordinates to bottom-left PDF coordinates
            const mapped = CoordinateMapper.map(
              word.boundingBox.x,
              word.boundingBox.y,
              word.boundingBox.width,
              word.boundingBox.height,
              ocrResult.imageHeight,
              imgLeft,
              imgBottom,
              scale
            );

            // Avoid drawing text with non-positive dimensions or zero coordinates
            if (mapped.height <= 0 || mapped.width <= 0) {
              continue;
            }

            // Draw selectable word on top of image with opacity 0 (invisible selectable)
            pdfPage.drawText(word.text, {
              x: mapped.x,
              y: mapped.y,
              size: mapped.height,
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
