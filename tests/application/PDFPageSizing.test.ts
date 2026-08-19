import { CoordinateMapper } from '../../src/infrastructure/pdf/coordinate/CoordinateMapper.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('Running PDF Page Sizing and Coordinate Mapping Tests...');

// Helper to simulate 1:1 screen-sized calculations with margin
function getScreenSizeParams(W: number, H: number) {
  const margin = 10;
  const pageWidth = W + margin * 2;
  const pageHeight = H + margin * 2;
  const scale = 1.0;
  const imgLeft = margin;
  const imgBottom = margin;

  return { pageWidth, pageHeight, scale, imgLeft, imgBottom };
}

// 1. Test Landscape Screenshot (e.g., 1920x1080)
function testLandscapeSizing() {
  const W = 1920;
  const H = 1080;
  const params = getScreenSizeParams(W, H);

  // Expected page dimensions: identical to image size + margins
  assert(params.pageWidth === 1920 + 20, 'Landscape should match image width + margins');
  assert(params.pageHeight === 1080 + 20, 'Landscape should match image height + margins');
  assert(params.scale === 1.0, 'Scale should be exactly 1.0');
  assert(params.imgLeft === 10, 'imgLeft should be 10');
  assert(params.imgBottom === 10, 'imgBottom should be 10');

  console.log('✓ Landscape Sizing with border - PASS');
}

// 2. Test Portrait Screenshot (e.g., 1080x1920)
function testPortraitSizing() {
  const W = 1080;
  const H = 1920;
  const params = getScreenSizeParams(W, H);

  // Expected page dimensions: identical to image size + margins
  assert(params.pageWidth === 1080 + 20, 'Portrait should match image width + margins');
  assert(params.pageHeight === 1920 + 20, 'Portrait should match image height + margins');
  assert(params.scale === 1.0, 'Scale should be exactly 1.0');
  assert(params.imgLeft === 10, 'imgLeft should be 10');
  assert(params.imgBottom === 10, 'imgBottom should be 10');

  console.log('✓ Portrait Sizing with border - PASS');
}

// 3. Test OCR Bounding Box Mappings at Edges (1:1 scaling with margins)
function testOcrEdgeMappings() {
  const W = 1000;
  const H = 500;
  const params = getScreenSizeParams(W, H);

  // OCR Box at Left Edge: x = 0, y = 100, width = 50, height = 20
  const leftBox = CoordinateMapper.map(0, 100, 50, 20, H, params.imgLeft, params.imgBottom, params.scale);
  assert(leftBox.x === 10, 'Left box mapped X should equal imgLeft (10)');

  // OCR Box at Right Edge: x = W - width = 950, y = 100, width = 50, height = 20
  const rightBox = CoordinateMapper.map(950, 100, 50, 20, H, params.imgLeft, params.imgBottom, params.scale);
  assert(rightBox.x === 960, 'Right box mapped X match (950 + 10)');

  // OCR Box at Top Edge: x = 100, y = 0, width = 50, height = 20
  const topBox = CoordinateMapper.map(100, 0, 50, 20, H, params.imgLeft, params.imgBottom, params.scale);
  // Expected Y = 10 + (H - 0 - 20) * 1.0 = H - 10
  assert(topBox.y === (H - 10), 'Top box mapped Y match');

  // OCR Box at Bottom Edge: x = 100, y = H - height = 480, width = 50, height = 20
  const bottomBox = CoordinateMapper.map(100, 480, 50, 20, H, params.imgLeft, params.imgBottom, params.scale);
  // Expected Y = 10 + (H - 480 - 20) * 1.0 = 10
  assert(bottomBox.y === 10, 'Bottom box mapped Y match');

  console.log('✓ OCR Edge Bounding Box Mapping Calculations - PASS');
}

function runAll() {
  testLandscapeSizing();
  testPortraitSizing();
  testOcrEdgeMappings();
  console.log('All PDF Page Sizing and Coordinate Mapping calculations verified successfully!');
}

runAll();
