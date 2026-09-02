import { exportToCanvas } from '@excalidraw/excalidraw';

// Excalidraw adds a small padding around elements when exporting.
// This constant matches Excalidraw's internal DEFAULT_EXPORT_PADDING.
const EXCALIDRAW_EXPORT_PADDING = 10;

/**
 * Generates a final rendered image bounding all Excalidraw annotations precisely
 * to the original screenshot dimensions. Anything drawn outside is strictly cropped.
 *
 * @param originalImageDataUrl The base64 data URL of the original screenshot
 * @param originalWidth Width of the original screenshot
 * @param originalHeight Height of the original screenshot
 * @param mimeType MIME type of the original screenshot
 * @param annotationData JSON string of user elements
 * @returns A promise resolving to the final composited Data URL
 */
export async function renderBoundedPageImage(
  originalImageDataUrl: string,
  originalWidth: number,
  originalHeight: number,
  mimeType: string,
  annotationData: string
): Promise<string> {
  const elements = JSON.parse(annotationData || '[]');

  if (elements.length === 0) {
    return originalImageDataUrl;
  }

  return new Promise(async (resolve, reject) => {
    try {
      // 1. Export ONLY the user-drawn elements to a transparent canvas via Excalidraw's API.
      //    We do NOT pass getDimensions here — let Excalidraw export the natural bounding box
      //    so we get reliable size and can correctly place them on our output canvas.
      const excalidrawCanvas = await exportToCanvas({
        elements,
        appState: {
          exportBackground: false,
          viewBackgroundColor: 'transparent',
          exportWithDarkMode: true,
          theme: 'dark',
        },
        files: null,
      });

      // 2. Calculate the bounding box of the user-drawn elements (in scene coordinates).
      let minX = Infinity;
      let minY = Infinity;

      elements.forEach((el: any) => {
        if (el.x < minX) minX = el.x;
        if (el.y < minY) minY = el.y;
      });

      // 3. Prepare our bounded output canvas — exact original screenshot dimensions.
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = originalWidth;
      outputCanvas.height = originalHeight;
      const ctx = outputCanvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get 2d context for bounded output canvas');
      }

      // 4. Load the original screenshot and composite.
      const img = new Image();
      img.onload = () => {
        // Draw background screenshot exactly at 0,0.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, originalWidth, originalHeight);
        ctx.drawImage(img, 0, 0, originalWidth, originalHeight);

        // 5. Draw Excalidraw annotations on top.
        //
        // Excalidraw's exported canvas starts at (minX - padding, minY - padding)
        // relative to the scene. To place it correctly on our screenshot-based
        // output canvas we offset by (minX - padding).
        const drawX = minX - EXCALIDRAW_EXPORT_PADDING;
        const drawY = minY - EXCALIDRAW_EXPORT_PADDING;
        ctx.drawImage(excalidrawCanvas, drawX, drawY);

        // 6. Convert final composited canvas back to Data URL.
        const outputMime = mimeType.startsWith('image/') ? mimeType : 'image/png';
        resolve(outputCanvas.toDataURL(outputMime, 0.92));
      };

      img.onerror = () => {
        reject(new Error('Failed to load original screenshot image for compositing'));
      };

      img.src = originalImageDataUrl;
    } catch (err) {
      reject(err);
    }
  });
}
