const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function createPNG(width, height, drawPixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0);
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData.push(r, g, b, a);
    }
  }
  const raw = Buffer.from(rawData);
  const compressed = zlib.deflateSync(raw);

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend)
  ]);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radius = r * 0.85;

  const cornerSize = r * 0.25;
  let inRoundedRect = false;
  const left = cx - radius;
  const right = cx + radius;
  const top = cy - radius;
  const bottom = cy + radius;

  if (x >= left && x <= right && y >= top && y <= bottom) {
    const inCornerTL = (x < left + cornerSize) && (y < top + cornerSize) &&
      (Math.sqrt((x - (left + cornerSize)) ** 2 + (y - (top + cornerSize)) ** 2) > cornerSize);
    const inCornerTR = (x > right - cornerSize) && (y < top + cornerSize) &&
      (Math.sqrt((x - (right - cornerSize)) ** 2 + (y - (top + cornerSize)) ** 2) > cornerSize);
    const inCornerBL = (x < left + cornerSize) && (y > bottom - cornerSize) &&
      (Math.sqrt((x - (left + cornerSize)) ** 2 + (y - (bottom - cornerSize)) ** 2) > cornerSize);
    const inCornerBR = (x > right - cornerSize) && (y > bottom - cornerSize) &&
      (Math.sqrt((x - (right - cornerSize)) ** 2 + (y - (bottom - cornerSize)) ** 2) > cornerSize);
    if (!inCornerTL && !inCornerTR && !inCornerBL && !inCornerBR) {
      inRoundedRect = true;
    }
  }

  if (!inRoundedRect) return [0, 0, 0, 0];

  const t = (x + y) / (w + h);
  const r1 = lerp(99, 139, t);
  const g1 = lerp(102, 92, t);
  const b1 = lerp(241, 246, t);

  const tvX = cx - r * 0.1;
  const tvY = cy - r * 0.05;
  const tvW = r * 0.9;
  const tvH = r * 0.67;
  const tvLeft = tvX - tvW / 2;
  const tvRight = tvX + tvW / 2;
  const tvTop = tvY - tvH / 2;
  const tvBottom = tvY + tvH / 2;
  const tvCorner = r * 0.08;

  let inTV = false;
  if (x >= tvLeft && x <= tvRight && y >= tvTop && y <= tvBottom) {
    const inTL = (x < tvLeft + tvCorner) && (y < tvTop + tvCorner) &&
      (Math.sqrt((x - (tvLeft + tvCorner)) ** 2 + (y - (tvTop + tvCorner)) ** 2) > tvCorner);
    const inTR = (x > tvRight - tvCorner) && (y < tvTop + tvCorner) &&
      (Math.sqrt((x - (tvRight - tvCorner)) ** 2 + (y - (tvTop + tvCorner)) ** 2) > tvCorner);
    const inBL = (x < tvLeft + tvCorner) && (y > tvBottom - tvCorner) &&
      (Math.sqrt((x - (tvLeft + tvCorner)) ** 2 + (y - (tvBottom - tvCorner)) ** 2) > tvCorner);
    const inBR = (x > tvRight - tvCorner) && (y > tvBottom - tvCorner) &&
      (Math.sqrt((x - (tvRight - tvCorner)) ** 2 + (y - (tvBottom - tvCorner)) ** 2) > tvCorner);
    if (!inTL && !inTR && !inBL && !inBR) inTV = true;
  }

  if (inTV) {
    const px = (x - tvLeft) / tvW;
    const py = (y - tvTop) / tvH;
    const triX = 0.5;
    const triY = 0.5;
    const triSize = 0.25;

    const v0x = triX - triSize * 0.5;
    const v0y = triY - triSize * 0.6;
    const v1x = triX + triSize * 0.5;
    const v1y = triY;
    const v2x = triX - triSize * 0.5;
    const v2y = triY + triSize * 0.6;

    const d1 = (px - v1x) * (v0y - v1y) - (v0x - v1x) * (py - v1y);
    const d2 = (px - v2x) * (v1y - v2y) - (v1x - v2x) * (py - v2y);
    const d3 = (px - v0x) * (v2y - v0y) - (v2x - v0x) * (py - v0y);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    const inTriangle = !(hasNeg && hasPos);

    if (inTriangle && w >= 32) {
      return [r1, g1, b1, 245];
    }
    return [255, 255, 255, 245];
  }

  const barY = cy + r * 0.4;
  const bar1W = r * 0.75;
  const bar1H = r * 0.09;
  if (Math.abs(y - barY) < bar1H / 2 && Math.abs(x - cx) < bar1W / 2 && w >= 32) {
    return [255, 255, 255, 150];
  }
  const bar2Y = barY + r * 0.16;
  const bar2W = r * 0.55;
  const bar2H = r * 0.06;
  if (Math.abs(y - bar2Y) < bar2H / 2 && Math.abs(x - cx) < bar2W / 2 && w >= 48) {
    return [255, 255, 255, 100];
  }

  return [r1, g1, b1, 255];
}

const outDir = path.join(__dirname);

const sizes = [
  { size: 16, name: 'icon16.png' },
  { size: 48, name: 'icon48.png' },
  { size: 128, name: 'icon128.png' }
];

sizes.forEach(({ size, name }) => {
  const png = createPNG(size, size, (x, y, w, h) => drawIcon(x, y, w, h));
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`✅ 已生成: ${name} (${size}x${size})`);
});

console.log('\n🎉 所有图标已生成完毕！');
