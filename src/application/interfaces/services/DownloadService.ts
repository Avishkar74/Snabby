export interface DownloadService {
  download(pdfBlob: Blob, filename: string): Promise<void>;
}
