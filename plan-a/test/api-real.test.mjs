// 真实文件系统集成测试 — 验证上传→文件落盘→download_url 可访问
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import supertest from 'supertest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..', 'server');
const tmpStorage = path.resolve(__dirname, '..', 'test-storage-tmp');

// 用临时目录替代真实 storage
process.env.STORAGE_OVERRIDE = tmpStorage;

const serverRequire = createRequire(path.join(serverDir, 'app.js'));
const app = serverRequire('./app.js');
const db = serverRequire('./db.js');

const VALID_SN = 'REALTEST';

beforeAll(() => {
  fs.mkdirSync(tmpStorage, { recursive: true });
});

afterAll(() => {
  db.closeDb();
  // 等 SQLite 释放文件锁
  fs.rmSync(tmpStorage, { recursive: true, force: true });
});

describe('真实文件系统: 上传 + 下载', () => {
  const bookContent = Buffer.from('real file integration test content ' + Date.now());

  it('上传文件后 download_url 可访问', async () => {
    // 1. 上传
    const up = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .attach('file', bookContent, '测试书.txt')
      .expect(200);

    const { book_id, download_url, format, title } = up.body;
    expect(book_id).toMatch(/^b_/);
    expect(format).toBe('txt');
    expect(download_url).toMatch(new RegExp(`/dl/${VALID_SN}/books/${book_id}/`));

    // 2. 用 download_url 下载
    const dl = await supertest(app)
      .get(download_url)
      .parse((res, cb) => { let d = ''; res.on('data', c => d += c); res.on('end', () => cb(null, d)); })
      .expect(200);

    expect(dl.body).toBe(bookContent.toString());
    expect(dl.headers['content-type']).toMatch(/text\/plain/);
  });

  it('上传同名文件不覆盖，各自独立', async () => {
    const f1 = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .attach('file', Buffer.from('content A'), '同书名.txt')
      .expect(200);

    const f2 = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .attach('file', Buffer.from('content B'), '同书名.txt')
      .expect(200);

    // 两个不同的 book_id
    expect(f1.body.book_id).not.toBe(f2.body.book_id);

    // 各自下载内容正确
    const parse = (res, cb) => { let d = ''; res.on('data', c => d += c); res.on('end', () => cb(null, d)); };
    const d1 = await supertest(app).get(f1.body.download_url).parse(parse).expect(200);
    const d2 = await supertest(app).get(f2.body.download_url).parse(parse).expect(200);
    expect(d1.body).toBe('content A');
    expect(d2.body).toBe('content B');
  });

  it('URL 中文件名任意填不影响下载（只认 book_id）', async () => {
    const up = await supertest(app)
      .post('/api/v1/books/upload')
      .field('sn', VALID_SN)
      .attach('file', Buffer.from('任意文件名测试'), '真实书名.txt')
      .expect(200);

    const { book_id, format } = up.body;

    // 把 URL 里的文件名改成别的，应该依然 200
    const fakeUrl = `/dl/${VALID_SN}/books/${book_id}/FAKE_NAME_123.${format}`;
    const parse = (res, cb) => { let d = ''; res.on('data', c => d += c); res.on('end', () => cb(null, d)); };
    const dl = await supertest(app).get(fakeUrl).parse(parse).expect(200);
    expect(dl.body).toBe('任意文件名测试');
  });

  it('不存在的 book_id 返回 404', async () => {
    await supertest(app)
      .get(`/dl/${VALID_SN}/books/nonexistent_xx/anything.txt`)
      .expect(404);
  });
});
