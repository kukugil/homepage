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

function sanitizeTitle(title) {
  if (!title) return 'untitled'
  return title
    .replace(/[\/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'untitled'
}

// 新文件命名：{bookId}.{format}，无碰撞
function bookPath(sn, bookId, format) {
  const ext = format ? `.${format}` : ''
  return path.join(booksDir(sn), `${bookId}${ext}`)
}

// 兼容旧文件：尝试找到实际存在的文件
async function resolveBookFilePath(sn, book) {
  // 优先：DB 中存储的实际文件名
  if (book.filename) {
    const p = path.join(booksDir(sn), book.filename)
    if (await fileExists(p)) return p
  }
  // 新命名：{bookId}.{format}
  const newPath = bookPath(sn, book.book_id, book.format)
  if (await fileExists(newPath)) return newPath
  // 旧命名：{sanitizedTitle}.{format}
  const oldPath = path.join(booksDir(sn), `${sanitizeTitle(book.title)}.${book.format}`)
  if (await fileExists(oldPath)) return oldPath
  // 兜底：返回新路径（上传时用）
  return newPath
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
  snDir, booksDir, coversDir, bookPath, resolveBookFilePath, coverPath, manifestPath, manifestTmpPath,
  ensureDirs, fileExists, getFileSize, sha256File, sanitizeSN, sanitizeFilename, sanitizeTitle,
  removeDir, atomicWrite,
};
