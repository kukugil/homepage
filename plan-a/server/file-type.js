const fs = require('fs');
const path = require('path');

// Read first N bytes of a file
function readHeader(filePath, bytes = 8) {
  const buf = Buffer.alloc(bytes);
  const fd = fs.openSync(filePath, 'r');
  try { fs.readSync(fd, buf, 0, bytes, 0); }
  finally { fs.closeSync(fd); }
  return buf;
}

// Check if buffer looks like binary data (high proportion of NUL or non-printable bytes)
function looksBinary(buf) {
  let nonPrintable = 0;
  const sample = buf.subarray(0, Math.min(buf.length, 1024));
  for (const b of sample) {
    if (b === 0 || (b < 0x09 && b !== 0x0a && b !== 0x0d)) nonPrintable++;
  }
  return nonPrintable > sample.length * 0.1;
}

// Detect PDF by %PDF header
function isPDF(filePath) {
  try {
    const h = readHeader(filePath, 5);
    return h.toString('ascii').startsWith('%PDF');
  } catch { return false; }
}

// Detect EPUB (ZIP with mimetype)
function isEPUB(filePath) {
  try {
    const h = readHeader(filePath, 4);
    if (h[0] !== 0x50 || h[1] !== 0x4B) return false; // PK
    // Quick check: look for "mimetypeapplication/epub+zip" in first few KB
    const buf = Buffer.alloc(4096);
    const fd = fs.openSync(filePath, 'r');
    let found = false;
    try {
      fs.readSync(fd, buf, 0, 4096, 0);
      found = buf.toString('utf8').includes('application/epub+zip');
    } finally { fs.closeSync(fd); }
    return found;
  } catch { return false; }
}

// Detect MP3 by ID3 or sync bits
function isMP3(filePath) {
  try {
    const h = readHeader(filePath, 3);
    // ID3v2 tag
    if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) return true; // "ID3"
    // MPEG frame sync: 0xFFE0
    if (h[0] === 0xFF && (h[1] & 0xE0) === 0xE0) return true;
    return false;
  } catch { return false; }
}

// Validate TXT — reject obvious binaries
function isTXT(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const size = Math.min(stat.size, 2048);
    if (size === 0) return false;
    const buf = Buffer.alloc(size);
    const fd = fs.openSync(filePath, 'r');
    try { fs.readSync(fd, buf, 0, size, 0); }
    finally { fs.closeSync(fd); }
    // If >30% NUL or high non-printable ratio, reject as binary
    return !looksBinary(buf);
  } catch { return false; }
}

// TODO: validate waveform files against MCU protocol spec
// When the waveform format is confirmed, implement:
// - magic header check (e.g. "WAVE" or vendor-specific)
// - version field validation
// - payload length matches file size
// - CRC32 checksum verification
function validateWaveformFile(filePath) {
  // For now: accept bin/fw as waveform if it passes basic binary check
  // Replace this placeholder when MCU waveform spec is provided
  try {
    const stat = fs.statSync(filePath);
    // Waveform files should be at least 1KB
    if (stat.size < 1024) return { ok: false, reason: 'Waveform file too small (< 1KB)' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// Main detection function
function detectFileType(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const validExts = ['.epub', '.pdf', '.txt', '.mp3', '.bin', '.fw'];

  if (!validExts.includes(ext)) {
    return { ok: false, reason: `Unsupported extension: ${ext}`, format: ext.replace('.', ''), file_type: 'unknown' };
  }

  // Books: PDF
  if (ext === '.pdf') {
    if (!isPDF(filePath)) return { ok: false, reason: 'File is not a valid PDF (missing %PDF header)', format: 'pdf', file_type: 'book' };
    return { ok: true, format: 'pdf', file_type: 'book' };
  }

  // Books: EPUB
  if (ext === '.epub') {
    if (!isEPUB(filePath)) return { ok: false, reason: 'File is not a valid EPUB (not a ZIP with mimetype)', format: 'epub', file_type: 'book' };
    return { ok: true, format: 'epub', file_type: 'book' };
  }

  // Books: TXT
  if (ext === '.txt') {
    if (!isTXT(filePath)) return { ok: false, reason: 'File appears to be binary, not a text file', format: 'txt', file_type: 'book' };
    return { ok: true, format: 'txt', file_type: 'book' };
  }

  // Audio: MP3
  if (ext === '.mp3') {
    if (!isMP3(filePath)) return { ok: false, reason: 'File is not a valid MP3', format: 'mp3', file_type: 'audio' };
    return { ok: true, format: 'mp3', file_type: 'audio' };
  }

  // Waveform/Firmware: BIN / FW
  if (ext === '.bin' || ext === '.fw') {
    const wf = validateWaveformFile(filePath);
    if (!wf.ok) return { ok: false, reason: wf.reason || 'Invalid waveform file', format: ext.replace('.', ''), file_type: 'waveform' };
    return { ok: true, format: ext.replace('.', ''), file_type: 'waveform' };
  }

  return { ok: false, reason: 'Unknown format', format: 'unknown', file_type: 'unknown' };
}

// Helpers for push validation
function isWaveformItem(item) {
  return item.file_type === 'waveform';
}

function isBookLikeItem(item) {
  return item.file_type === 'book' || item.file_type === 'audio';
}

module.exports = { detectFileType, isWaveformItem, isBookLikeItem };
