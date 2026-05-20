const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const CONFIG = require('./config');

function snDir(sn) {
  return path.join(CONFIG.DL_DIR, sn);
}

function booksDir(sn) {
  return path.join(snDir(sn), 'books');
}

function coversDir(sn) {
  return path.join(snDir(sn), 'covers');
}

function bookPath(sn, bookId) {
  return path.join(booksDir(sn), bookId);
}

function coverPath(sn, bookId) {
  return path.join(coversDir(sn), `${bookId}.jpg`);
}

function manifestPath(sn) {
  return path.join(snDir(sn), 'manifest.json');
}

function manifestTmpPath(sn) {
  return path.join(snDir(sn), 'manifest.json.tmp');
}

async function ensureDirs(sn) {
  await fsp.mkdir(booksDir(sn), { recursive: true });
  await fsp.mkdir(coversDir(sn), { recursive: true });
}

async function fileExists(filePath) {
  try { await fsp.access(filePath); return true; }
  catch { return false; }
}

async function getFileSize(filePath) {
  const stat = await fsp.stat(filePath);
  return stat.size;
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function sanitizeSN(sn) {
  if (!CONFIG.SN_PATTERN.test(sn)) {
    throw new Error('Invalid SN format');
  }
  return sn;
}

function sanitizeFilename(name) {
  return path.basename(name.replace(/\.\./g, '').replace(/[\\\/]/g, ''));
}

async function removeDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  await fsp.writeFile(tmp, content);
  await fsp.rename(tmp, filePath);
}

module.exports = {
  snDir, booksDir, coversDir, bookPath, coverPath, manifestPath, manifestTmpPath,
  ensureDirs, fileExists, getFileSize, sha256File, sanitizeSN, sanitizeFilename,
  removeDir, atomicWrite,
};
