import { createWorker } from 'tesseract.js';

export class TesseractWorker {
  private worker: any = null;
  private initializingPromise: Promise<any> | null = null;

  private async getWorker(): Promise<any> {
    if (this.worker) {
      return this.worker;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      try {
        console.log('[TesseractWorker] Initializing Tesseract worker...');

        const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.getURL;

        const options: Record<string, any> = {
          cacheMethod: 'none',
          gzip: false,
          workerBlobURL: false,
        };

        if (isExtension) {
          options.workerPath = chrome.runtime.getURL('assets/tesseract/worker.min.js');
          options.corePath = chrome.runtime.getURL('assets/tesseract');
          options.langPath = chrome.runtime.getURL('assets/tesseract');
        } else {
          // Node / unit test environment: point langPath to local folder where eng.traineddata exists
          options.langPath = './';
        }

        console.log('[TesseractWorker] Creating worker with options:', options);
        // Create worker for English language
        const worker = await createWorker('eng', 1, options);
        this.worker = worker;
        this.initializingPromise = null;
        console.log('[TesseractWorker] Tesseract worker initialized successfully.');
        return worker;
      } catch (err: unknown) {
        this.initializingPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Tesseract initialization failed: ${msg}`);
      }
    })();

    return this.initializingPromise;
  }

  public async recognize(dataUrl: string): Promise<{
    text: string;
    confidence: number;
    words: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  }> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new Error('Tesseract recognition failed: Invalid image format');
    }
    const parts = dataUrl.split(',');
    if (parts.length < 2 || parts[1].length < 20) {
      throw new Error('Tesseract recognition failed: Corrupt or truncated image data');
    }

    try {
      const worker = await this.getWorker();
      console.log('[TesseractWorker] Running text recognition with blocks enabled...');
      const result = await worker.recognize(dataUrl, {}, { blocks: true, text: true });
      console.log('[TesseractWorker] Text recognition complete.');

      const text = result.data?.text || '';
      const confidence = result.data?.confidence || 0;

      // Extract and map word level details from blocks hierarchy
      const mappedWords: Array<{
        text: string;
        confidence: number;
        bbox: { x0: number; y0: number; x1: number; y1: number };
      }> = [];

      if (Array.isArray(result.data?.blocks)) {
        for (const block of result.data.blocks) {
          for (const paragraph of (block.paragraphs || [])) {
            for (const line of (paragraph.lines || [])) {
              for (const word of (line.words || [])) {
                if (word && word.text && word.bbox) {
                  const cleanText = String(word.text).trim();
                  if (cleanText) {
                    mappedWords.push({
                      text: cleanText,
                      confidence: typeof word.confidence === 'number' ? word.confidence : 0,
                      bbox: {
                        x0: word.bbox.x0 || 0,
                        y0: word.bbox.y0 || 0,
                        x1: word.bbox.x1 || 0,
                        y1: word.bbox.y1 || 0,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Fallback: if blocks was empty but result.data.words exists
      if (mappedWords.length === 0 && Array.isArray(result.data?.words)) {
        for (const word of result.data.words) {
          if (word && word.text && word.bbox) {
            const cleanText = String(word.text).trim();
            if (cleanText) {
              mappedWords.push({
                text: cleanText,
                confidence: typeof word.confidence === 'number' ? word.confidence : 0,
                bbox: {
                  x0: word.bbox.x0 || 0,
                  y0: word.bbox.y0 || 0,
                  x1: word.bbox.x1 || 0,
                  y1: word.bbox.y1 || 0,
                },
              });
            }
          }
        }
      }

      console.log(`[TesseractWorker] Extracted ${mappedWords.length} words with bounding boxes.`);

      return {
        text,
        confidence,
        words: mappedWords
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Tesseract recognition failed: ${msg}`);
    }
  }

  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
