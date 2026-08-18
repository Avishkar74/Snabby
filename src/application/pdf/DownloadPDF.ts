import type { DownloadService } from '../interfaces/services/DownloadService.ts';

export interface DownloadPDFInput {
  pdfBlob: Blob;
  filename: string;
}

export class DownloadPDF {
  private downloadService: DownloadService;

  constructor(downloadService: DownloadService) {
    this.downloadService = downloadService;
  }

  public async execute(input: DownloadPDFInput): Promise<void> {
    const { pdfBlob, filename } = input;
    return this.downloadService.download(pdfBlob, filename);
  }
}
