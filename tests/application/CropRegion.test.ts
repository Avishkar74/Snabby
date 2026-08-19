function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running Crop Region Coordinate Conversion and Selection Tests...');

// Coordinate conversion helper matching CropOverlay.ts mapping
function convertCssToScreenshot(
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
  dpr: number
) {
  return {
    x: Math.round(cssX * dpr),
    y: Math.round(cssY * dpr),
    width: Math.round(cssW * dpr),
    height: Math.round(cssH * dpr),
  };
}

// Image processor crop boundary clamping logic
function clampCropRect(
  x: number,
  y: number,
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number
) {
  const clampedX = Math.max(0, Math.min(x, imageWidth - 1));
  const clampedY = Math.max(0, Math.min(y, imageHeight - 1));
  const clampedW = Math.max(1, Math.min(width, imageWidth - clampedX));
  const clampedH = Math.max(1, Math.min(height, imageHeight - clampedY));
  return { x: clampedX, y: clampedY, width: clampedW, height: clampedH };
}

// 1. Test DPR scaling conversions
function testDprConversions() {
  // Case A: 1 CSS pixel = 1 screenshot pixel (dpr = 1)
  const rectA = convertCssToScreenshot(10, 20, 100, 200, 1.0);
  assert(rectA.x === 10 && rectA.y === 20 && rectA.width === 100 && rectA.height === 200, 'DPR = 1 mapping should be 1:1');

  // Case B: Retina display (dpr = 2.0)
  const rectB = convertCssToScreenshot(10, 20, 100, 200, 2.0);
  assert(rectB.x === 20 && rectB.y === 40 && rectB.width === 200 && rectB.height === 400, 'DPR = 2 mapping should double coords');

  // Case C: Non-integer zoom level (dpr = 1.25)
  const rectC = convertCssToScreenshot(15, 25, 105, 205, 1.25);
  assert(rectC.x === Math.round(15 * 1.25), 'DPR = 1.25 X match');
  assert(rectC.width === Math.round(105 * 1.25), 'DPR = 1.25 Width match');

  console.log('✓ CSS to Screenshot pixel conversion (DPR scaling) - PASS');
}

// 2. Test crop boundary clamping
function testCropClamping() {
  const imageWidth = 1920;
  const imageHeight = 1080;

  // Case A: Fully within bounds
  const r1 = clampCropRect(100, 100, 500, 400, imageWidth, imageHeight);
  assert(r1.x === 100 && r1.y === 100 && r1.width === 500 && r1.height === 400, 'Within bounds should not alter rect');

  // Case B: Out of bounds (negative coords)
  const r2 = clampCropRect(-50, -50, 200, 200, imageWidth, imageHeight);
  assert(r2.x === 0 && r2.y === 0 && r2.width === 200 && r2.height === 200, 'Negative coords should clamp x/y to 0 while preserving width');

  // Case C: Right/Bottom edge overflow
  const r3 = clampCropRect(1800, 1000, 300, 200, imageWidth, imageHeight);
  assert(r3.x === 1800 && r3.y === 1000, 'Edges start intact');
  assert(r3.width === 120, `Width should clip to remaining image size, got ${r3.width}`);
  assert(r3.height === 80, `Height should clip to remaining image size, got ${r3.height}`);

  console.log('✓ Image crop boundary clamping (out-of-bounds protection) - PASS');
}

function runAll() {
  testDprConversions();
  testCropClamping();
  console.log('Crop region coordinate tests completed successfully!');
}

runAll();
