const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function getSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="cineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${size * 0.04}" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0b0f19" stroke="#1f293d" stroke-width="${size * 0.02}"/>
  <path d="M${size * 0.25} ${size * 0.32}C${size * 0.25} ${size * 0.28} ${size * 0.28} ${size * 0.25} ${size * 0.32} ${size * 0.25}H${size * 0.68}C${size * 0.72} ${size * 0.25} ${size * 0.75} ${size * 0.28} ${size * 0.75} ${size * 0.32}V${size * 0.68}C${size * 0.75} ${size * 0.72} ${size * 0.72} ${size * 0.75} ${size * 0.68} ${size * 0.75}H${size * 0.32}C${size * 0.28} ${size * 0.75} ${size * 0.25} ${size * 0.72} ${size * 0.25} ${size * 0.68}V${size * 0.32}Z" fill="#121826" stroke="url(#cineGrad)" stroke-width="${size * 0.03}"/>
  <polygon points="${size * 0.42},${size * 0.38} ${size * 0.65},${size * 0.5} ${size * 0.42},${size * 0.62}" fill="url(#cineGrad)" filter="url(#glow)"/>
  <circle cx="${size * 0.7}" cy="${size * 0.3}" r="${size * 0.035}" fill="#f59e0b" filter="url(#glow)"/>
  <circle cx="${size * 0.3}" cy="${size * 0.7}" r="${size * 0.03}" fill="#3b82f6" filter="url(#glow)"/>
</svg>`;
}

fs.writeFileSync(path.join(iconsDir, 'icon-192x192.svg'), getSvg(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512x512.svg'), getSvg(512));
console.log('SVG icons generated in public/icons/');
