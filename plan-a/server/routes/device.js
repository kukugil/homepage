const express = require('express');
const db = require('../db');
const { regenerateManifest, readManifest } = require('../manifest');
const { validateSN, asyncHandler } = require('../middleware');
const { bookPath, coverPath, fileExists, booksDir, sanitizeTitle } = require('../storage');
const fsp = require('fs/promises');
const path = require('path');

const router = express.Router();

// GET /api/v1/devices/:sn/books
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
        cover_url: `/dl/${sn}/covers/${b.book_id}.jpg`,
        download_url: `/dl/${sn}/books/${encodeURIComponent(sanitizeTitle(b.title))}.${b.format}`,
        created_at: b.created_at,
      })),
    });
  })
);

// DELETE /api/v1/devices/:sn/books/:bookId
router.delete('/devices/:sn/books/:bookId',
  validateSN,
  asyncHandler(async (req, res) => {
    const { sn, bookId } = req.params;
    const book = db.getBook(bookId);
    if (!book || book.sn !== sn) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Try new naming (title-based) first, fall back to old (bookId-based)
    const newPath = await bookPath(sn, book.title, book.format);
    const oldPath = path.join(booksDir(sn), `${bookId}.${book.format}`);
    try { await fsp.unlink(newPath); } catch {}
    try { if (await fileExists(oldPath)) await fsp.unlink(oldPath); } catch {}
    try { await fsp.unlink(coverPath(sn, bookId)); } catch {}

    db.deleteBook(bookId);
    await regenerateManifest(sn);

    res.json({ deleted: true });
  })
);

// PUT /api/v1/devices/:sn/books/reorder
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

// GET /api/v1/devices/:sn/manifest (for debugging)
router.get('/devices/:sn/manifest',
  validateSN,
  asyncHandler(async (req, res) => {
    const manifest = await readManifest(req.validatedSN);
    if (!manifest) return res.status(404).json({ error: 'No manifest found' });
    res.json(manifest);
  })
);

module.exports = router;
