const express = require('express');
const db = require('../db');
const { regenerateManifest, readManifest } = require('../manifest');
const { validateSN, asyncHandler } = require('../middleware');
const { resolveBookFilePath, coverPath, fileExists, sanitizeTitle } = require('../storage');
const fsp = require('fs/promises');
const path = require('path');

const router = express.Router();

/**
 * @openapi
 * /api/v1/devices/{sn}/books:
 *   get:
 *     tags: [Devices]
 *     summary: 获取设备图书列表
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *         description: 设备序列号
 *     responses:
 *       200:
 *         description: 图书列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sn: { type: string }
 *                 books:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Book'
 *       400:
 *         description: SN 格式无效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/devices/:sn/books',
  validateSN,
  asyncHandler(async (req, res) => {
    const sn = req.validatedSN;
    const books = db.getBooksBySn(sn);
    res.json({
      sn,
      books: books.map(b => ({
        book_id: b.book_id,
        title: b.title,
        author: b.author,
        file_size: b.file_size,
        format: b.format,
        checksum: b.checksum ? `sha256:${b.checksum}` : '',
        metadata_version: b.metadata_version,
        selected: b.selected || 0,
        cover_url: `/dl/${sn}/covers/${b.book_id}.jpg`,
        download_url: `/dl/${sn}/books/${b.book_id}/${encodeURIComponent(sanitizeTitle(b.title))}.${b.format}`,
        created_at: b.created_at,
      })),
    });
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/books/{bookId}:
 *   delete:
 *     tags: [Devices]
 *     summary: 删除图书
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *         description: 设备序列号
 *       - in: path
 *         name: bookId
 *         required: true
 *         schema: { type: string }
 *         description: 图书 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 *       404:
 *         description: 图书不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/devices/:sn/books/:bookId',
  validateSN,
  asyncHandler(async (req, res) => {
    const { sn, bookId } = req.params;
    const book = db.getBook(bookId);
    if (!book || book.sn !== sn) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // 用 resolveBookFilePath 找到实际文件并删除
    const filePath = await resolveBookFilePath(sn, book);
    try { await fsp.unlink(filePath); } catch {}
    try { await fsp.unlink(coverPath(sn, bookId)); } catch {}

    db.deleteBook(bookId);
    await regenerateManifest(sn);

    res.json({ deleted: true });
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/books/reorder:
 *   put:
 *     tags: [Devices]
 *     summary: 重新排序图书
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *         description: 设备序列号
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [book_ids]
 *             properties:
 *               book_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: 按新顺序排列的图书 ID 列表
 *     responses:
 *       200:
 *         description: 排序成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       400:
 *         description: book_ids 无效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/devices/:sn/books/reorder',
  validateSN,
  express.json(),
  asyncHandler(async (req, res) => {
    const sn = req.validatedSN;
    const { book_ids } = req.body;
    if (!Array.isArray(book_ids)) {
      return res.status(400).json({ error: 'book_ids must be an array' });
    }
    const existing = db.getBooksBySn(sn);
    const existingIds = new Set(existing.map(b => b.book_id));
    for (const id of book_ids) {
      if (!existingIds.has(id)) {
        return res.status(400).json({ error: `Unknown book_id: ${id}` });
      }
    }

    book_ids.forEach((id, i) => db.updateSortOrder(id, i));

    await regenerateManifest(sn);
    res.json({ ok: true });
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/queue:
 *   get:
 *     tags: [Devices]
 *     summary: 获取选中书籍队列（供 MCU 下载）
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 选中书籍列表
 */
router.get('/devices/:sn/queue',
  validateSN,
  asyncHandler(async (req, res) => {
    const { buildQueue } = require('../manifest');
    res.json(buildQueue(req.validatedSN));
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/bundle:
 *   get:
 *     tags: [Devices]
 *     summary: 获取选中书籍的纯文本 URL 列表（供 MCU 逐行下载）
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 每行一个下载 URL 的纯文本
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get('/devices/:sn/bundle',
  validateSN,
  asyncHandler(async (req, res) => {
    const sn = req.validatedSN;
    const books = db.getSelectedBooksBySn(sn);
    const target = db.getDeviceTarget(sn);
    const urls = books.map(b =>
      `/dl/${sn}/books/${b.book_id}.${b.format}`
    );
    res.header('Content-Type', 'text/plain; charset=utf-8');
    // 第一行: target (1=flash, 0=TF卡), 后续行: 下载 URL
    res.send(String(target) + '\n' + urls.join('\n') + (urls.length > 0 ? '\n' : ''));
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/status:
 *   get:
 *     tags: [Devices]
 *     summary: 查询 SN 是否在数据库中存在
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: SN 状态
 */
router.get('/devices/:sn/status',
  validateSN,
  asyncHandler(async (req, res) => {
    const books = db.getBooksBySn(req.validatedSN);
    res.json({ exists: books.length > 0, book_count: books.length });
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/books/select:
 *   put:
 *     tags: [Devices]
 *     summary: 选择要推送到设备的图书
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               book_ids: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: 选择成功
 */
router.put('/devices/:sn/books/select',
  validateSN,
  express.json(),
  asyncHandler(async (req, res) => {
    const sn = req.validatedSN;
    const { book_ids, target } = req.body || {};
    db.selectBooks(sn, Array.isArray(book_ids) ? book_ids : []);
    // target: 1=flash, 0=TF卡 (可选，不传则保持之前设置)
    if (typeof target === 'number') {
      db.setDeviceTarget(sn, target);
    }
    await regenerateManifest(sn);
    res.json({ ok: true, selected: book_ids ? book_ids.length : 0, target: db.getDeviceTarget(sn) });
  })
);

/**
 * @openapi
 * /api/v1/devices/{sn}/manifest:
 *   get:
 *     tags: [Devices]
 *     summary: 获取设备 manifest（调试用）
 *     parameters:
 *       - in: path
 *         name: sn
 *         required: true
 *         schema: { type: string }
 *         description: 设备序列号
 *     responses:
 *       200:
 *         description: Manifest JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       404:
 *         description: Manifest 不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/devices/:sn/manifest',
  validateSN,
  asyncHandler(async (req, res) => {
    const manifest = await readManifest(req.validatedSN);
    if (!manifest) return res.status(404).json({ error: 'No manifest found' });
    res.json(manifest);
  })
);

module.exports = router;
