import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const publicDir = path.resolve('public');
const logoSvgPath = path.join(publicDir, 'logo.svg');
const svgContent = fs.readFileSync(logoSvgPath, 'utf-8');

const targets = [
  { name: 'icon-512.png', size: 512 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'icon-192.png', size: 192 },
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-precomposed.png', size: 180 },
];

for (const target of targets) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${target.size}px;
      height: ${target.size}px;
      overflow: hidden;
      background: transparent;
    }
    svg {
      width: ${target.size}px;
      height: ${target.size}px;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  const tempHtmlPath = path.join(publicDir, `_temp_${target.size}.html`);
  const outputPath = path.join(publicDir, target.name);

  fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

  try {
    const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');
    execFileSync(chromePath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--force-device-scale-factor=1',
      `--window-size=${target.size},${target.size}`,
      '--default-background-color=00000000',
      `--screenshot=${outputPath}`,
      fileUrl
    ]);
    console.log(`Generated ${target.name} (${target.size}x${target.size})`);
  } catch (err) {
    console.error(`Error generating ${target.name}:`, err.message);
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

// Generate favicon.ico from 192 or 180 PNG by copying if ICO encoder isn't present
// or create a minimal ICO header wrapping PNG data (standard modern ICO format supported by all browsers)
const icon192Path = path.join(publicDir, 'icon-192.png');
if (fs.existsSync(icon192Path)) {
  const pngBuffer = fs.readFileSync(icon192Path);
  
  // Standard ICO format with embedded PNG:
  // 6 bytes header: 0, 0 (reserved), 1, 0 (type 1 = ICO), 1, 0 (1 image)
  // 16 bytes directory entry:
  //   width (1 byte: 0 for 256 or actual), height (1 byte), palette count (1 byte), reserved (1 byte: 0),
  //   color planes (2 bytes: 1, 0), bits per pixel (2 bytes: 32, 0), size of image data (4 bytes LE),
  //   offset of image data (4 bytes LE: 6 + 16 = 22)
  const icoHeader = Buffer.alloc(22);
  icoHeader.writeUInt16LE(0, 0); // reserved
  icoHeader.writeUInt16LE(1, 2); // image type (1 = icon)
  icoHeader.writeUInt16LE(1, 4); // image count (1)

  icoHeader.writeUInt8(0, 6); // width (0 = 256 or larger)
  icoHeader.writeUInt8(0, 7); // height
  icoHeader.writeUInt8(0, 8); // color palette
  icoHeader.writeUInt8(0, 9); // reserved
  icoHeader.writeUInt16LE(1, 10); // color planes
  icoHeader.writeUInt16LE(32, 12); // bpp
  icoHeader.writeUInt32LE(pngBuffer.length, 14); // image size in bytes
  icoHeader.writeUInt32LE(22, 18); // offset to image data

  const icoBuffer = Buffer.concat([icoHeader, pngBuffer]);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
  console.log('Generated favicon.ico (modern PNG-in-ICO format)');
}

console.log('Asset generation completed!');
