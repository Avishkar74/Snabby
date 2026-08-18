import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { PDFService } from '../../application/interfaces/services/PDFService.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { Capture } from '../../domain/capture/Capture.ts';
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

  public async generate(session: Session, captures: Capture[]): Promise<Blob> {
    try {
      const pdfDoc = await PDFDocument.create();
      
      // Set PDF Metadata
      pdfDoc.setTitle(session.name || `Snabby Session ${session.id}`);

      // Helvetica standard font is used for the invisible text overlay
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const capture of captures) {
        // 1. Load raw screenshot image data
        const imageAsset = await this.imageRepo.findById(capture.imageId);
        if (!imageAsset) {
          throw new Error(`Screenshot image not found in DB for capture: ${capture.id}`);
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

        // 3. Determine dynamic page size orientation
        let pageWidth: number;
        let pageHeight: number;
        if (imageWidth >= imageHeight) {
          pageWidth = 842; // A4 Landscape width
          pageHeight = 595; // A4 Landscape height
        } else {
          pageWidth = 595; // A4 Portrait width
          pageHeight = 842; // A4 Portrait height
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        // 4. Calculate Contain-Fit scale and centering offset
        const scaleX = pageWidth / imageWidth;
        const scaleY = pageHeight / imageHeight;
        const scale = Math.min(scaleX, scaleY);

        const renderedWidth = imageWidth * scale;
        const renderedHeight = imageHeight * scale;

        const imgLeft = (pageWidth - renderedWidth) / 2;
        const imgBottom = (pageHeight - renderedHeight) / 2;

        // 5. Draw the screenshot image
        page.drawImage(embeddedImage, {
          x: imgLeft,
          y: imgBottom,
          width: renderedWidth,
          height: renderedHeight,
        });

        // 6. Draw invisible selectable OCR text overlay if available
        const ocrResult = await this.ocrRepo.findByCaptureId(capture.id);
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
            page.drawText(word.text, {
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
