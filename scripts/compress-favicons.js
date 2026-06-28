/**
 * Compress oversized favicons (165KB → <10KB)
 * Uses sharp (already in package.json dependencies)
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const publicDir = path.join(__dirname, '..', 'public');

async function compressFavicons() {
  console.log('🔧 Compressing favicons...');
  
  const pngPath = path.join(publicDir, 'favicon.png');
  const icoPath = path.join(publicDir, 'favicon.ico');
  
  // Get original sizes
  const origPng = fs.statSync(pngPath).size;
  const origIco = fs.statSync(icoPath).size;
  console.log(`  Original favicon.png: ${(origPng / 1024).toFixed(1)}KB`);
  console.log(`  Original favicon.ico: ${(origIco / 1024).toFixed(1)}KB`);
  
  // Compress favicon.png to 180x180 (Apple touch icon size) with high quality
  await sharp(pngPath)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 80, compressionLevel: 9 })
    .toFile(pngPath + '.tmp');
  
  fs.renameSync(pngPath + '.tmp', pngPath);
  
  // Compress favicon.ico to 32x32 PNG (modern browsers accept PNG favicons)
  await sharp(icoPath)
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 80, compressionLevel: 9 })
    .toFile(icoPath + '.tmp');
  
  fs.renameSync(icoPath + '.tmp', icoPath);
  
  // Report new sizes
  const newPng = fs.statSync(pngPath).size;
  const newIco = fs.statSync(icoPath).size;
  console.log(`  Compressed favicon.png: ${(newPng / 1024).toFixed(1)}KB (${Math.round((1 - newPng/origPng) * 100)}% reduction)`);
  console.log(`  Compressed favicon.ico: ${(newIco / 1024).toFixed(1)}KB (${Math.round((1 - newIco/origIco) * 100)}% reduction)`);
  console.log('✅ Favicons compressed!');
}

compressFavicons().catch(e => {
  console.error('❌ Favicon compression failed:', e.message);
  process.exit(1);
});
