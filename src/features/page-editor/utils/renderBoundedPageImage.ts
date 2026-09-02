import { exportToCanvas } from '@excalidraw/excalidraw';

// Excalidraw adds a small padding around elements when exporting.
// This constant matches Excalidraw's internal DEFAULT_EXPORT_PADDING.
const EXCALIDRAW_EXPORT_PADDING = 10;

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Calculates the exact scene bounding box for a set of user Excalidraw elements.
 * Correctly accounts for points arrays (freedraw/line/arrow), stroke widths,
 * element dimensions, and user-uploaded image elements.
 */
function getElementsBounds(elements: any[], bgImageElementId?: string): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    if (bgImageElementId && el.id === bgImageElementId) continue;

    let elMinX = el.x;
    let elMinY = el.y;
    let elMaxX = el.x + (el.width || 0);
    let elMaxY = el.y + (el.height || 0);

    // Points-based elements (freedraw, line, arrow) store relative point offsets from (el.x, el.y)
    if (Array.isArray(el.points) && el.points.length > 0) {
      let pMinX = Infinity;
      let pMinY = Infinity;
      let pMaxX = -Infinity;
      let pMaxY = -Infinity;

      for (const pt of el.points) {
        if (Array.isArray(pt) && pt.length >= 2) {
          const absX = el.x + pt[0];
          const absY = el.y + pt[1];
          if (absX < pMinX) pMinX = absX;
          if (absX > pMaxX) pMaxX = absX;
          if (absY < pMinY) pMinY = absY;
          if (absY > pMaxY) pMaxY = absY;
        }
      }

      if (pMinX !== Infinity) elMinX = pMinX;
      if (pMinY !== Infinity) elMinY = pMinY;
      if (pMaxX !== -Infinity) elMaxX = pMaxX;
      if (pMaxY !== -Infinity) elMaxY = pMaxY;
    }

    // Account for stroke width expansion on non-image elements
    if (el.type !== 'image') {
      const halfStroke = (el.strokeWidth || 2) / 2;
      elMinX -= halfStroke;
      elMinY -= halfStroke;
      elMaxX += halfStroke;
      elMaxY += halfStroke;
    }

    if (elMinX < minX) minX = elMinX;
    if (elMinY < minY) minY = elMinY;
    if (elMaxX > maxX) maxX = elMaxX;
    if (elMaxY > maxY) maxY = elMaxY;
  }

  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Generates a final rendered image bounding all Excalidraw annotations precisely
 * to the original screenshot dimensions. Anything drawn outside is strictly cropped.
 *
 * @param originalImageDataUrl The base64 data URL of the original screenshot
 * @param originalWidth Width of the original screenshot
 * @param originalHeight Height of the original screenshot
 * @param mimeType MIME type of the original screenshot
 * @param annotationData JSON string of user elements
 * @param files Optional map of Excalidraw BinaryFiles for user-uploaded images
 * @param bgImageElementId Optional element ID of the background screenshot to exclude
 * @returns A promise resolving to the final composited Data URL
 */
export async function renderBoundedPageImage(
  originalImageDataUrl: string,
  originalWidth: number,
  originalHeight: number,
  mimeType: string,
  annotationData: string,
  files?: Record<string, any> | null,
  bgImageElementId?: string
): Promise<string> {
  const allElements = JSON.parse(annotationData || '[]');
  const userElements = allElements.filter((el: any) => {
    if (!el || el.isDeleted) return false;
    if (bgImageElementId && el.id === bgImageElementId) return false;
    return true;
  });

  if (userElements.length === 0) {
    return originalImageDataUrl;
  }

  return new Promise(async (resolve, reject) => {
    try {
      // 1. Export ONLY the user-drawn elements to a transparent canvas via Excalidraw's API.
      const excalidrawCanvas = await exportToCanvas({
        elements: userElements,
        appState: {
          exportBackground: false,
          viewBackgroundColor: 'transparent',
          exportWithDarkMode: true,
          theme: 'dark',
        },
        files: files || null,
      });

      // 2. Calculate the exact bounding box of the user-drawn elements (in scene coordinates).
      const bounds = getElementsBounds(userElements, bgImageElementId);

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
        const drawX = bounds.minX - EXCALIDRAW_EXPORT_PADDING;
        const drawY = bounds.minY - EXCALIDRAW_EXPORT_PADDING;
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
