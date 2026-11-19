const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgPath = path.resolve(__dirname, '../public/favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count

  let offset = 6 + count * 16;
  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map((b) => b.buffer)]);
}

async function run() {
  const publicDir = path.resolve(__dirname, '../public');

  // 1. Generate 16x16, 32x32, 48x48, 64x64, 180x180, 192x192, 512x512
  const sizes = [16, 32, 48, 64, 180, 192, 512];
  const rendered = {};

  for (const size of sizes) {
    const buf = await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    rendered[size] = buf;
  }

  // Save standalone PNGs
  fs.writeFileSync(path.join(publicDir, 'favicon-16x16.png'), rendered[16]);
  fs.writeFileSync(path.join(publicDir, 'favicon-32x32.png'), rendered[32]);
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), rendered[180]);
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), rendered[192]);
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), rendered[512]);

  // 2. Generate multi-resolution ICO file (16, 32, 48, 64)
  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: rendered[16] },
    { width: 32, height: 32, buffer: rendered[32] },
    { width: 48, height: 48, buffer: rendered[48] },
    { width: 64, height: 64, buffer: rendered[64] },
  ]);

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Successfully generated favicon.ico and PNG assets in public directory!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
