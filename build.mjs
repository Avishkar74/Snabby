import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

async function runBuild() {
  console.log('Building background and offscreen...');
  await build({
    configFile: false,
    plugins: [react()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2000,
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
      chunkSizeWarningLimit: 10000,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/main.tsx'),
        output: {
          format: 'iife',
          name: 'SnabbyUI',
          entryFileNames: 'assets/popup.js',
          inlineDynamicImports: true,
        },
        onwarn(warning, warn) {
          if (warning.code === 'EMPTY_IMPORT_META') return;
          warn(warning);
        },
      },
    },
  });

  // Post-process popup.js:
  // 1. Replace deprecated 'unload' window listener from Excalidraw with 'pagehide'
  // Chrome Permissions Policy on sites like GitHub rejects 'unload' listeners with:
  // "Permissions policy violation: unload is not allowed in this document."
  // 2. Escape non-ASCII characters into \uXXXX code units for Chrome UTF-8 loader compatibility
  console.log('Sanitizing popup.js for Chrome content script compatibility...');
  const popupJsPath = resolve(import.meta.dirname, 'dist/assets/popup.js');
  if (existsSync(popupJsPath)) {
    let content = readFileSync(popupJsPath, 'utf-8');

    // Replace window 'unload' registrations with 'pagehide'
    content = content.replace(/(window\s*,\s*[`'"])unload([`'"])/g, '$1pagehide$2');
    content = content.replace(/addEventListener\(\s*[`'"]unload[`'"]/g, 'addEventListener("pagehide"');
    content = content.replace(/removeEventListener\(\s*[`'"]unload[`'"]/g, 'removeEventListener("pagehide"');

    // Retarget Excalidraw global document clipboard listeners (paste, cut, copy) to container
    // This prevents Excalidraw from intercepting user clipboard events on host pages (e.g. Google Forms, GitHub)
    content = content.replace(/Wl\(document,([`'"]paste[`'"],this\.pasteFromClipboard)/g, 'Wl(this.excalidrawContainerRef?.current||document,$1');
    content = content.replace(/Wl\(document,([`'"]cut[`'"],this\.onCut)/g, 'Wl(this.excalidrawContainerRef?.current||document,$1');
    content = content.replace(/Wl\(document,([`'"]copy[`'"],this\.onCopy)/g, 'Wl(this.excalidrawContainerRef?.current||document,$1');

    // Guard textEditor focus & selection operations against DOMExceptions on detached elements during unmount/close
    content = content.replace(/n\|\|f\.focus\(\)/g, 'n||(f.isConnected?f.focus():null)');
    content = content.replace(/n\.removeAllRanges\(\)/g, '(function(){try{n.removeAllRanges()}catch{}})()');

    // Defend clipboard parsing (Tue & Eue) so unexpected clipboard payloads never throw uncaught errors
    content = content.replace(/n\.value\.every\(([^)]*)\)\?/g, '(Array.isArray(n.value)&&n.value.every($1))?');
    content = content.replace(/Eue=async\(([^)]*)\)=>\{let n=await Tue\(e,t\);/g, 'Eue=async($1)=>{let n;try{n=await Tue(e,t);}catch{return{type:"text",value:""}}');

    // Replace file picker AbortError/DOMException error logging with console.warn
    // Chrome extension runtime records console.error() as a fatal extension error in chrome://extensions.
    // User cancellations or permissions rejections on showOpenFilePicker/showSaveFilePicker should not be fatal errors.
    content = content.replace(/e\??\.name===[`'"]AbortError[`'"]\?console\.warn\(e\):console\.error\(e\)/g, 'console.warn(e)');

    const sanitizedContent = content.replace(/[\u0080-\uFFFF]/g, (c) => {
      return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    });
    writeFileSync(popupJsPath, sanitizedContent, 'utf-8');
    console.log('Successfully sanitized popup.js for Chrome UTF-8 content script loading.');
  }

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
      if (src.endsWith('.wasm.js')) {
        let content = readFileSync(srcPath, 'utf8');
        // Route internal WASM stderr prints (e.g. "Image too small to scale", "Line cannot be recognized")
        // to console.warn rather than console.error to prevent false-positive Chrome extension error badges
        content = content.replace(/ka=console\.error\.bind\(console\)/g, 'ka=console.warn.bind(console)');
        writeFileSync(destPath, content, 'utf8');
        console.log(`Sanitized and copied ${src} -> ${dest}`);
      } else {
        copyFileSync(srcPath, destPath);
        console.log(`Copied ${src} -> ${dest}`);
      }
    } else {
      console.warn(`Warning: Source file for Tesseract asset not found: ${src}`);
    }
  }
}

runBuild();

