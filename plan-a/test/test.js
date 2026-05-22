// Simple integration test script — run with: node test/test.js
const http = require('http');

const BASE = 'http://localhost:3001';
const SN = 'SN-TEST-001';

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

async function run() {
  const results = [];
  const check = (name, ok) => { results.push({ name, ok }); console.log(ok ? `  ✓ ${name}` : `  ✗ ${name}`); };

  console.log('E-Reader Integration Tests\n');

  // 1. Server health check
  try {
    const r = await req('GET', '/');
    check('Server responds on /', r.status === 200);
  } catch (e) {
    check('Server responds on /', false);
    console.log('  Make sure server is running: node server/index.js');
    process.exit(1);
  }

  // 2. Upload a test TXT file
  const boundary = '----TestBoundary' + Date.now();
  const fileContent = 'Hello, E-Reader Test Book Content!';
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="sn"`,
    '',
    SN,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="test-book.txt"`,
    'Content-Type: text/plain',
    '',
    fileContent,
    `--${boundary}--`,
  ].join('\r\n');

  const uploadResp = await req('POST', '/api/v1/books/upload', body, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  });
  check('Upload single file', uploadResp.status === 200 && uploadResp.body.book_id);
  const bookId = uploadResp.body.book_id;

  // 3. Check manifest exists for device
  const manifestResp = await req('GET', `/dl/${SN}/manifest.json`);
  check('Manifest accessible', manifestResp.status === 200 && manifestResp.body.books);
  check('Manifest contains uploaded book', manifestResp.body.books && manifestResp.body.books.some(b => b.book_id === bookId));

  // 4. Check device books API
  const booksResp = await req('GET', `/api/v1/devices/${SN}/books`);
  check('Device books API', booksResp.status === 200 && booksResp.body.books && booksResp.body.books.length > 0);

  // 5. HEAD request for Range support
  const headResp = await new Promise((resolve) => {
    const r = http.request(`${BASE}/dl/${SN}/books/${bookId}.txt`, { method: 'HEAD' }, (res) => {
      resolve({ status: res.statusCode, headers: res.headers });
    });
    r.end();
  });
  check('HEAD returns Content-Length', headResp.status === 200 && headResp.headers['content-length']);
  check('Accept-Ranges header', headResp.headers['accept-ranges'] === 'bytes');

  // 6. Range request
  const rangeResp = await new Promise((resolve) => {
    const r = http.request(`${BASE}/dl/${SN}/books/${bookId}.txt`, {
      headers: { 'Range': 'bytes=0-4' },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d }));
    });
    r.end();
  });
  check('Range request returns 206', rangeResp.status === 206);
  check('Range response content', rangeResp.body === 'Hello');

  // 7. Delete book
  const deleteResp = await req('DELETE', `/api/v1/devices/${SN}/books/${bookId}`);
  check('Delete book', deleteResp.status === 200 && deleteResp.body.deleted);

  // 8. Manifest updated after delete
  const manifest2Resp = await req('GET', `/dl/${SN}/manifest.json`);
  check('Manifest updated after delete', manifest2Resp.body.books && !manifest2Resp.body.books.some(b => b.book_id === bookId));

  // Summary
  const passed = results.filter(r => r.ok).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  results.filter(r => !r.ok).forEach(r => console.log(`  FAIL: ${r.name}`));
  process.exit(passed === results.length ? 0 : 1);
}

run();
