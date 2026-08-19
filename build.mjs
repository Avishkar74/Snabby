import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

async function runBuild() {
  console.log('Building background and offscreen...');
  await build({
    configFile: false,
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          offscreen: resolve(import.meta.dirname, 'src/infrastructure/ocr/offscreen/offscreen.html'),
          background: resolve(import.meta.dirname, 'src/service-worker/index.ts'),
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name].[ext]',
        },
      },
    },
  });

  console.log('Building popup content script (IIFE / single bundle)...');
  await build({
    configFile: false,
    plugins: [react()],
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/main.tsx'),
        output: {
          format: 'iife',
          name: 'SnabbyUI',
          entryFileNames: 'assets/popup.js',
          inlineDynamicImports: true,
        },
      },
    },
  });

  try {
    copyFileSync('manifest.json', 'dist/manifest.json');
    console.log('manifest.json copied to dist/');
  } catch (err) {
    console.error('Failed to copy manifest.json:', err);
  }

  // Copy local Tesseract.js assets for 100% offline extension execution
  console.log('Copying local Tesseract.js offline assets...');
  const tesseractTargetDir = resolve(import.meta.dirname, 'dist/assets/tesseract');
  if (!existsSync(tesseractTargetDir)) {
    mkdirSync(tesseractTargetDir, { recursive: true });
  }

  const filesToCopy = [
    { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'dist/assets/tesseract/worker.min.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core.wasm.js', dest: 'dist/assets/tesseract/tesseract-core.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core.wasm', dest: 'dist/assets/tesseract/tesseract-core.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core.js', dest: 'dist/assets/tesseract/tesseract-core.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', dest: 'dist/assets/tesseract/tesseract-core-simd.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd.wasm', dest: 'dist/assets/tesseract/tesseract-core-simd.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd.js', dest: 'dist/assets/tesseract/tesseract-core-simd.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', dest: 'dist/assets/tesseract/tesseract-core-lstm.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm', dest: 'dist/assets/tesseract/tesseract-core-lstm.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-lstm.js', dest: 'dist/assets/tesseract/tesseract-core-lstm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', dest: 'dist/assets/tesseract/tesseract-core-simd-lstm.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', dest: 'dist/assets/tesseract/tesseract-core-simd-lstm.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.js', dest: 'dist/assets/tesseract/tesseract-core-simd-lstm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd.js', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd-lstm.wasm' },
    { src: 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.js', dest: 'dist/assets/tesseract/tesseract-core-relaxedsimd-lstm.js' },
    { src: 'eng.traineddata', dest: 'dist/assets/tesseract/eng.traineddata' },
  ];

  for (const { src, dest } of filesToCopy) {
    const srcPath = resolve(import.meta.dirname, src);
    const destPath = resolve(import.meta.dirname, dest);
    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`Copied ${src} -> ${dest}`);
    } else {
      console.warn(`Warning: Source file for Tesseract asset not found: ${src}`);
    }
  }
}

runBuild();

