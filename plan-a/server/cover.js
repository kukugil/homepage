const fsp = require('fs/promises');
const path = require('path');
const JSZip = require('jszip');
const sharp = require('sharp');
const CONFIG = require('./config');
const { coverPath, ensureDirs } = require('./storage');

async function extractEpubCover(epubFilePath, sn, bookId) {
  const buf = await fsp.readFile(epubFilePath);
  const zip = await JSZip.loadAsync(buf);

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Not a valid EPUB: missing container.xml');

  const containerXml = await containerFile.async('string');
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error('Cannot find OPF path in container.xml');
  const opfPath = opfMatch[1];

  const opfDir = path.dirname(opfPath);
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error('OPF file not found');
  const opfXml = await opfFile.async('string');

  let coverHref = null;
  const coverMetaMatch = opfXml.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"[^>]*\/?>/i);
  if (coverMetaMatch) {
    const coverId = coverMetaMatch[1];
    const itemRe = new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"[^>]*\/?>`, 'i');
    const itemMatch = opfXml.match(itemRe);
    if (itemMatch) coverHref = itemMatch[1];
  }

  if (!coverHref) {
    const imgMatch = opfXml.match(/<item[^>]*media-type="image\/(?:jpeg|png|jpg)"[^>]*href="([^"]+)"[^>]*\/?>/i);
    if (imgMatch) coverHref = imgMatch[1];
  }

  if (!coverHref) throw new Error('No cover image found in EPUB');

  const coverFullPath = path.posix.join(opfDir, coverHref);
  const coverFile = zip.file(coverFullPath);
  if (!coverFile) {
    const allFiles = Object.keys(zip.files);
    const match = allFiles.find(f => path.basename(f).toLowerCase() === path.basename(coverHref).toLowerCase());
    if (match) {
      const altCover = zip.file(match);
      if (altCover) return await generateThumbnail(await altCover.async('nodebuffer'), sn, bookId);
    }
    throw new Error('Cover image file not found in archive');
  }

  const coverBuf = await coverFile.async('nodebuffer');
  return await generateThumbnail(coverBuf, sn, bookId);
}

async function generateThumbnail(imageBuf, sn, bookId) {
  await ensureDirs(sn);
  const outPath = coverPath(sn, bookId);
  await sharp(imageBuf)
    .resize(CONFIG.COVER_WIDTH, CONFIG.COVER_HEIGHT, { fit: 'inside', background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: CONFIG.COVER_QUALITY })
    .toFile(outPath);
  return outPath;
}

async function generateDefaultCover(sn, bookId, title) {
  await ensureDirs(sn);
  const outPath = coverPath(sn, bookId);
  const svg = `<svg width="${CONFIG.COVER_WIDTH}" height="${CONFIG.COVER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#e0e0e0"/>
    <text x="150" y="190" font-family="Arial" font-size="16" fill="#666" text-anchor="middle">${escapeXml(title || 'Unknown')}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: CONFIG.COVER_QUALITY }).toFile(outPath);
  return outPath;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function extractCover(filePath, sn, bookId, format, title) {
  try {
    if (format === 'epub') {
      return await extractEpubCover(filePath, sn, bookId);
    }
    return await generateDefaultCover(sn, bookId, title);
  } catch (err) {
    console.error(`Cover extraction failed for ${bookId}: ${err.message}`);
    return await generateDefaultCover(sn, bookId, title);
  }
}

module.exports = { extractCover, generateDefaultCover, generateThumbnail };
