const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config');
const db = require('../db');
const { ensureDirs, bookPath, sha256File, sanitizeTitle } = require('../storage');
const { regenerateManifest } = require('../manifest');
const { extractCover } = require('../cover');
const { validateSN, rateLimiter, asyncHandler } = require('../middleware');

const router = express.Router();

// Fix double-encoded UTF-8 filenames from multer/busboy.
// Busboy may interpret UTF-8 bytes of the Content-Disposition filename as Latin-1,
// causing mojibake when those characters are later re-encoded as UTF-8.
function fixFilenameEncoding(str) {
  if (!str || /^[\x00-\x7F]*$/.test(str)) return str || '';
  if (/[一-鿿㐀-䶿぀-ゟ゠-ヿ]/.test(str)) return str;
  const fixed = Buffer.from(str, 'latin1').toString('utf8');
  return /[一-鿿]/.test(fixed) ? fixed : str;
}

const uploadDir = path.join(CONFIG.STORAGE_ROOT, 'tmp');
const chunkDir = path.join(uploadDir, 'chunks');
const completedChunkDir = path.join(uploadDir, 'completed-chunks');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      require('fs').mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: CONFIG.MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

function validateUploadId(uploadId) {
  if (!uploadId || !/^[a-zA-Z0-9_-]{8,80}$/.test(uploadId)) {
    throw new Error('Invalid uploadId');
  }
  return uploadId;
}

function validateChunkMeta(body) {
  const uploadId = validateUploadId(body.uploadId);
  const filename = body.filename || '';
  const chunkIndex = Number(body.chunkIndex);
  const totalChunks = Number(body.totalChunks);
  const totalSize = Number(body.totalSize);

  if (!filename || !path.extname(filename)) throw new Error('Missing filename');
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error('Invalid chunkIndex');
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 10000) throw new Error('Invalid totalChunks');
  if (chunkIndex >= totalChunks) throw new Error('chunkIndex out of range');
  if (!Number.isInteger(totalSize) || totalSize < 1 || totalSize > CONFIG.MAX_FILE_SIZE) throw new Error('Invalid totalSize');

  const ext = path.extname(filename).toLowerCase();
  if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`);
  }

  return { uploadId, filename, chunkIndex, totalChunks, totalSize };
}

async function registerBookFromFile({ sn, sourcePath, originalName, fileSize }) {
  const bookId = `b_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
  const ext = path.extname(originalName).toLowerCase();
  const format = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : ext === '.bin' ? 'bin' : ext === '.fw' ? 'fw' : 'txt';
  const title = fixFilenameEncoding(path.basename(originalName, ext));
  const filename = `${bookId}.${format}`;
  await ensureDirs(sn);

  const fsp = require('fs/promises');
  const destPath = bookPath(sn, bookId, format);
  await fsp.copyFile(sourcePath, destPath);
  await fsp.unlink(sourcePath).catch(() => {});

  const checksum = await sha256File(destPath);

  extractCover(destPath, sn, bookId, format, title).catch(err =>
    console.error(`Cover extraction error for ${bookId}: ${err.message}`)
  );

  const sortOrder = db.getBooksBySn(sn).length;
  db.insertBook({
    book_id: bookId, sn, title, filename,
    author: '', file_size: fileSize, format,
    checksum, metadata_version: 1, sort_order: sortOrder,
  });

  await regenerateManifest(sn);

  return {
    book_id: bookId,
    title,
    author: '',
    file_size: fileSize,
    format,
    checksum: `sha256:${checksum}`,
    cover_url: `/dl/${sn}/covers/${bookId}.jpg`,
    download_url: `/dl/${sn}/books/${bookId}/${encodeURIComponent(sanitizeTitle(title))}.${format}`,
  };
}

async function mergeChunks({ uploadId, filename, totalChunks, totalSize }) {
  const fs = require('fs');
  const fsp = require('fs/promises');
  const dir = path.join(chunkDir, uploadId);
  const mergedPath = path.join(uploadDir, `${uploadId}${path.extname(filename).toLowerCase()}`);

  for (let i = 0; i < totalChunks; i++) {
    const p = path.join(dir, `${i}.part`);
    await fsp.access(p);
  }

  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(mergedPath);
    out.on('error', reject);
    out.on('finish', resolve);

    let i = 0;
    const appendNext = () => {
      if (i >= totalChunks) {
        out.end();
        return;
      }
      const input = fs.createReadStream(path.join(dir, `${i}.part`));
      input.on('error', reject);
      input.on('end', () => {
        i += 1;
        appendNext();
      });
      input.pipe(out, { end: false });
    };
    appendNext();
  });

  const stat = await fsp.stat(mergedPath);
  if (stat.size !== totalSize) {
    await fsp.unlink(mergedPath).catch(() => {});
    throw new Error('Merged file size mismatch');
  }

  await fsp.rm(dir, { recursive: true, force: true });
  return mergedPath;
}

async function readCompletedChunkUpload(uploadId) {
  const fsp = require('fs/promises');
  const completedPath = path.join(completedChunkDir, `${uploadId}.json`);
  const raw = await fsp.readFile(completedPath, 'utf8').catch(() => null);
  return raw ? JSON.parse(raw) : null;
}

async function writeCompletedChunkUpload(uploadId, result) {
  const fsp = require('fs/promises');
  await fsp.mkdir(completedChunkDir, { recursive: true });
  await fsp.writeFile(
    path.join(completedChunkDir, `${uploadId}.json`),
    JSON.stringify({ complete: true, ...result, completed_at: new Date().toISOString() })
  );
}

/**
 * @openapi
 * /api/v1/books/upload:
 *   post:
 *     tags: [Books]
 *     summary: 上传单本图书
 *     description: 上传一本图书文件（epub/pdf/txt），自动提取封面并注册到设备。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [sn, file]
 *             properties:
 *               sn:
 *                 type: string
 *                 description: 设备序列号
 *                 example: 'SN001'
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 图书文件（epub/pdf/txt，最大 500MB）
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResult'
 *       400:
 *         description: 参数错误（缺少文件或 SN 无效）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未授权（TOKEN_AUTH 模式）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: 文件过大
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: 请求过于频繁
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/books/upload',
  rateLimiter(),
  upload.single('file'),
  validateSN,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const sn = req.validatedSN;
    const result = await registerBookFromFile({
      sn,
      sourcePath: req.file.path,
      originalName: req.file.originalname,
      fileSize: req.file.size,
    });
    res.json(result);
  })
);

router.post('/books/chunk-upload',
  upload.single('chunk'),
  validateSN,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No chunk provided' });

    const fsp = require('fs/promises');
    let meta;
    try {
      meta = validateChunkMeta(req.body);
    } catch (err) {
      await fsp.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: err.message });
    }

    const completed = await readCompletedChunkUpload(meta.uploadId);
    if (completed) {
      await fsp.unlink(req.file.path).catch(() => {});
      return res.json(completed);
    }

    const dir = path.join(chunkDir, meta.uploadId);
    const chunkPath = path.join(dir, `${meta.chunkIndex}.part`);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.unlink(chunkPath).catch(() => {});
    await fsp.rename(req.file.path, chunkPath);

    if (meta.chunkIndex !== meta.totalChunks - 1) {
      return res.json({
        complete: false,
        received: meta.chunkIndex + 1,
        total_chunks: meta.totalChunks,
      });
    }

    let mergedPath;
    try {
      mergedPath = await mergeChunks(meta);
      const result = await registerBookFromFile({
        sn: req.validatedSN,
        sourcePath: mergedPath,
        originalName: meta.filename,
        fileSize: meta.totalSize,
      });
      await writeCompletedChunkUpload(meta.uploadId, result);
      return res.json({ complete: true, ...result });
    } catch (err) {
      if (mergedPath) await fsp.unlink(mergedPath).catch(() => {});
      return res.status(400).json({ error: err.message });
    }
  })
);

/**
 * @openapi
 * /api/v1/books/batch-upload:
 *   post:
 *     tags: [Books]
 *     summary: 批量上传图书
 *     description: 一次上传最多 10 本图书文件，逐本处理并分别返回结果。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [sn, files]
 *             properties:
 *               sn:
 *                 type: string
 *                 description: 设备序列号
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: 图书文件列表（最多 10 个）
 *     responses:
 *       200:
 *         description: 批量处理完成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename: { type: string }
 *                       status: { type: string, enum: [ok, error] }
 *                       book_id: { type: string }
 *                       reason: { type: string }
 *                 success_count: { type: integer }
 *                 fail_count: { type: integer }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: 请求过于频繁
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/books/batch-upload',
  rateLimiter(),
  upload.array('files', 10),
  validateSN,
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const sn = req.validatedSN;
    await ensureDirs(sn);
    const fsp = require('fs/promises');

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const file of req.files) {
      try {
        const bookId = `b_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        const format = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : ext === '.bin' ? 'bin' : ext === '.fw' ? 'fw' : 'txt';
        const title = fixFilenameEncoding(path.basename(file.originalname, ext));
        const filename = `${bookId}.${format}`;
        const destPath = bookPath(sn, bookId, format);
        await fsp.copyFile(file.path, destPath);
        await fsp.unlink(file.path).catch(() => {});
        const checksum = await sha256File(destPath);

        extractCover(destPath, sn, bookId, format, title).catch(err =>
          console.error(`Cover extraction error for ${bookId}: ${err.message}`)
        );

        const sortOrder = db.getBooksBySn(sn).length;
        db.insertBook({
          book_id: bookId, sn, title, filename, author: '', file_size: file.size,
          format, checksum, metadata_version: 1, sort_order: sortOrder,
        });

        results.push({ filename: file.originalname, status: 'ok', book_id: bookId });
        successCount++;
      } catch (err) {
        results.push({ filename: file.originalname, status: 'error', reason: err.message });
        failCount++;
      }
    }

    await regenerateManifest(sn);
    res.json({ results, success_count: successCount, fail_count: failCount });
  })
);

module.exports = router;
