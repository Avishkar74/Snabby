export interface PDFService {
  generatePDF(images: string[]): Promise<Blob>;
}
