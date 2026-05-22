const fsp = require('fs/promises');
const db = require('./db');
const { manifestPath, atomicWrite } = require('./storage');

function buildManifest(sn) {
  const books = db.getBooksBySn(sn);
  const manifest = {
    sn,
    version: Date.now(),
    updated_at: new Date().toISOString(),
    books: books.map((b, i) => ({
      book_id: b.book_id,
      title: b.title || 'Unknown',
      author: b.author || 'Unknown',
      file_size: b.file_size,
      format: b.format,
      checksum: b.checksum ? `sha256:${b.checksum}` : '',
      metadata_version: b.metadata_version || 1,
      cover_url: `/dl/${sn}/covers/${b.book_id}.jpg`,
      download_url: `/dl/${sn}/books/${b.book_id}.${b.format}`,
      added_at: b.created_at,
      sort_order: i,
    })),
  };
  return manifest;
}

async function regenerateManifest(sn) {
  const manifest = buildManifest(sn);
  const path = require('path');
  await fsp.mkdir(path.dirname(manifestPath(sn)), { recursive: true });
  const content = JSON.stringify(manifest, null, 2);
  await atomicWrite(manifestPath(sn), content);
  return manifest;
}

async function readManifest(sn) {
  try {
    const data = await fsp.readFile(manifestPath(sn), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

module.exports = { buildManifest, regenerateManifest, readManifest };
