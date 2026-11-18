const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const svgPath = path.resolve(__dirname, '../public/favicon.svg');
  const tauriIconsDir = path.resolve(__dirname, '../src-tauri/icons');
  if (!fs.existsSync(tauriIconsDir)) {
    fs.mkdirSync(tauriIconsDir, { recursive: true });
  }

  const out1024 = path.join(tauriIconsDir, 'icon-1024.png');
  const svgBuffer = fs.readFileSync(svgPath);

  await sharp(svgBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out1024);

  console.log('Successfully generated', out1024);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
