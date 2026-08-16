export interface OCRService {
  performOCR(imageUrl: string): Promise<string>;
}
