import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';
import Module from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import supertest from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..', 'server');
const serverRequire = createRequire(path.join(serverDir, 'app.js'));

// Inject in-memory DB mock before loading the app
const dbMock = serverRequire('./db-mock.js');
const realDbPath = path.join(serverDir, 'db.js');
Module._cache[realDbPath] = { exports: dbMock };

const app = serverRequire('./app.js');

const VALID_SN = 'TEST001';
const INVALID_SN = '!!!invalid!!!';

let uploadedBookId;
let batchBookIds = [];
const bookContent = Buffer.from('Vitest test book content ' + Date.now());

// ═══════════════════════════════════════════════════════════════
// 1. GET /health
// ═══════════════════════════════════════════════════════════════
describe('GET /health', () => {
  it('returns 200 with status info', async () => {
    const res = await supertest(app).get('/health').expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.serving).toBe('public');
    expect(res.body).toHaveProperty('frontendReady');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. POST /api/v1/books/upload
// ═══════════════════════════════════════════════════════════════
describe('POST /api/v1/books/upload', () => {
  it('200 — upload a valid TXT file', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .attach('file', bookContent, 'test-book.txt')
      .expect(200);

    expect(res.body).toHaveProperty('book_id');
    expect(res.body.title).toBe('test-book');
    expect(res.body.format).toBe('txt');
    expect(res.body).toHaveProperty('checksum');
    expect(res.body.cover_url).toContain(VALID_SN);
    expect(res.body.download_url).toContain(VALID_SN);

    uploadedBookId = res.body.book_id;
  });

  it('400 — no file provided', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .expect(400);

    expect(res.body.error).toMatch(/file/i);
  });

  it('400 — missing SN field', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/upload')
      .attach('file', bookContent, 'no-sn.txt')
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', INVALID_SN)
      .attach('file', bookContent, 'bad-sn.txt')
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. POST /api/v1/books/batch-upload
// ═══════════════════════════════════════════════════════════════
describe('POST /api/v1/books/chunk-upload', () => {
  it('200 - uploads chunks and registers the merged book', async () => {
    const content = Buffer.from('chunk A\nchunk B\nchunk C');
    const uploadId = `testchunk${Date.now()}`;
    const chunks = [
      content.subarray(0, 8),
      content.subarray(8, 16),
      content.subarray(16),
    ];

    for (let i = 0; i < chunks.length; i++) {
      const res = await supertest(app)
        .post('/api/v1/books/chunk-upload')
        .field('sn', VALID_SN)
        .field('uploadId', uploadId)
        .field('filename', 'chunked-book.txt')
        .field('chunkIndex', String(i))
        .field('totalChunks', String(chunks.length))
        .field('totalSize', String(content.length))
        .attach('chunk', chunks[i], 'chunked-book.txt')
        .expect(200);

      if (i < chunks.length - 1) {
        expect(res.body.complete).toBe(false);
      } else {
        expect(res.body.complete).toBe(true);
        expect(res.body.title).toBe('chunked-book');
        expect(res.body.format).toBe('txt');
        expect(res.body.file_size).toBe(content.length);
      }
    }
  });

  it('400 - rejects invalid chunk metadata', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/chunk-upload')
      .field('sn', VALID_SN)
      .field('uploadId', 'bad')
      .field('filename', 'bad.txt')
      .field('chunkIndex', '0')
      .field('totalChunks', '1')
      .field('totalSize', '3')
      .attach('chunk', Buffer.from('bad'), 'bad.txt')
      .expect(400);

    expect(res.body.error).toMatch(/uploadId/i);
  });
});

describe('POST /api/v1/books/batch-upload', () => {
  it('200 — batch upload 2 files', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/batch-upload')
      .field('sn', VALID_SN)
      .attach('files', Buffer.from('batch book A'), 'batch-a.txt')
      .attach('files', Buffer.from('batch book B'), 'batch-b.txt')
      .expect(200);

    expect(res.body.success_count).toBe(2);
    expect(res.body.fail_count).toBe(0);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results[0].status).toBe('ok');
    expect(res.body.results[1].status).toBe('ok');

    batchBookIds = res.body.results.map(r => r.book_id);
  });

  it('400 — no files provided', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/batch-upload')
      .field('sn', VALID_SN)
      .expect(400);

    expect(res.body.error).toMatch(/file/i);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .post('/api/v1/books/batch-upload')
      .field('sn', INVALID_SN)
      .attach('files', bookContent, 'bad-sn-batch.txt')
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. GET /api/v1/devices/:sn/books
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/devices/:sn/books', () => {
  it('200 — list books for device', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`)
      .expect(200);

    expect(res.body.sn).toBe(VALID_SN);
    expect(Array.isArray(res.body.books)).toBe(true);
    expect(res.body.books.length).toBeGreaterThanOrEqual(3);

    const found = res.body.books.find(b => b.book_id === uploadedBookId);
    expect(found).toBeDefined();
    expect(found.title).toBe('test-book');
    expect(found.format).toBe('txt');
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${INVALID_SN}/books`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. DELETE /api/v1/devices/:sn/books/:bookId
// ═══════════════════════════════════════════════════════════════
describe('DELETE /api/v1/devices/:sn/books/:bookId', () => {
  it('200 — delete existing book', async () => {
    const targetId = batchBookIds[0];
    const res = await supertest(app)
      .delete(`/api/v1/devices/${VALID_SN}/books/${targetId}`)
      .expect(200);

    expect(res.body.deleted).toBe(true);
  });

  it('404 — delete non-existent book', async () => {
    const res = await supertest(app)
      .delete(`/api/v1/devices/${VALID_SN}/books/nonexistent123`)
      .expect(404);

    expect(res.body.error).toMatch(/not found/i);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .delete(`/api/v1/devices/${INVALID_SN}/books/${uploadedBookId}`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. PUT /api/v1/devices/:sn/books/reorder
// ═══════════════════════════════════════════════════════════════
describe('PUT /api/v1/devices/:sn/books/reorder', () => {
  it('200 — reorder books', async () => {
    const list = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`)
      .expect(200);

    const ids = list.body.books.map(b => b.book_id);
    const reversed = [...ids].reverse();

    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/reorder`)
      .send({ book_ids: reversed })
      .expect(200);

    expect(res.body.ok).toBe(true);

    const list2 = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`);
    expect(list2.body.books.map(b => b.book_id)).toEqual(reversed);
  });

  it('400 — book_ids not an array', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/reorder`)
      .send({ book_ids: 'not-an-array' })
      .expect(400);

    expect(res.body.error).toMatch(/array/i);
  });

  it('400 — unknown book_id in list', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/reorder`)
      .send({ book_ids: ['nonexistent123'] })
      .expect(400);

    expect(res.body.error).toMatch(/unknown/i);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${INVALID_SN}/books/reorder`)
      .send({ book_ids: [uploadedBookId] })
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. GET /api/v1/devices/:sn/manifest
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/devices/:sn/manifest', () => {
  it('200 — return manifest for device with books', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/manifest`)
      .expect(200);

    expect(res.body).toHaveProperty('books');
    expect(Array.isArray(res.body.books)).toBe(true);
  });

  it('404 — manifest not found for unknown SN', async () => {
    const res = await supertest(app)
      .get('/api/v1/devices/UNKNOWN99/manifest')
      .expect(404);

    expect(res.body.error).toMatch(/manifest/i);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${INVALID_SN}/manifest`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. PUT /api/v1/devices/:sn/books/select
// ═══════════════════════════════════════════════════════════════
describe('PUT /api/v1/devices/:sn/books/select', () => {
  it('200 — select books for push', async () => {
    const list = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`);
    const ids = list.body.books.map(b => b.book_id);

    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: ids, target: 1 })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.selected).toBe(ids.length);
    expect(res.body.target).toBe(1);
  });

  it('200 — target=0 sets TF card mode', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: [], target: 0 })
      .expect(200);

    expect(res.body.target).toBe(0);
  });

  it('200 — empty book_ids clears all selected', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: [] })
      .expect(200);

    expect(res.body.selected).toBe(0);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .put(`/api/v1/devices/${INVALID_SN}/books/select`)
      .send({ book_ids: [] })
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. GET /api/v1/devices/:sn/bundle
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/devices/:sn/bundle', () => {
  beforeAll(async () => {
    // Ensure some books are selected
    const list = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`);
    const ids = list.body.books.map(b => b.book_id);
    await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: ids, target: 1 });
  });

  it('200 — returns text/plain with target on first line', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/bundle`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/plain/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('1'); // target = flash
    // Each subsequent line should be a download URL
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toMatch(/^\/dl\//);
    }
  });

  it('200 — returns target=0 when TF card selected', async () => {
    await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: [], target: 0 });

    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/bundle`)
      .expect(200);

    expect(res.text.trim().split('\n')[0]).toBe('0');
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${INVALID_SN}/bundle`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. GET /api/v1/devices/:sn/queue
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/devices/:sn/queue', () => {
  beforeAll(async () => {
    const list = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`);
    const ids = list.body.books.map(b => b.book_id);
    await supertest(app)
      .put(`/api/v1/devices/${VALID_SN}/books/select`)
      .send({ book_ids: ids, target: 1 });
  });

  it('200 — returns JSON with target field', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/queue`)
      .expect(200);

    expect(res.body.sn).toBe(VALID_SN);
    expect(res.body).toHaveProperty('target');
    expect(res.body).toHaveProperty('books');
    expect(Array.isArray(res.body.books)).toBe(true);
  });

  it('200 — only returns selected books', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/queue`);

    const allBooks = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/books`);

    expect(res.body.books.length).toBeLessThanOrEqual(allBooks.body.books.length);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${INVALID_SN}/queue`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. GET /api/v1/devices/:sn/status
// ═══════════════════════════════════════════════════════════════
describe('GET /api/v1/devices/:sn/status', () => {
  it('200 — exists=true for device with books', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${VALID_SN}/status`)
      .expect(200);

    expect(res.body.exists).toBe(true);
    expect(res.body.book_count).toBeGreaterThan(0);
  });

  it('200 — exists=false for unknown device', async () => {
    const res = await supertest(app)
      .get('/api/v1/devices/UNKNOWN99/status')
      .expect(200);

    expect(res.body.exists).toBe(false);
    expect(res.body.book_count).toBe(0);
  });

  it('400 — invalid SN format', async () => {
    const res = await supertest(app)
      .get(`/api/v1/devices/${INVALID_SN}/status`)
      .expect(400);

    expect(res.body.error).toMatch(/SN/i);
  });
});
