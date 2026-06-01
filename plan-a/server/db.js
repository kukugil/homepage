const Database = require('better-sqlite3');
const path = require('path');
const CONFIG = require('./config');

const DB_PATH = path.join(CONFIG.STORAGE_ROOT, 'metadata.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      book_id       TEXT PRIMARY KEY,
      sn            TEXT NOT NULL,
      title         TEXT DEFAULT '',
      author        TEXT DEFAULT '',
      file_size     INTEGER NOT NULL,
      format        TEXT NOT NULL,
      checksum      TEXT DEFAULT '',
      metadata_version INTEGER DEFAULT 1,
      sort_order    INTEGER DEFAULT 0,
      selected      INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_books_sn ON books(sn);
    CREATE INDEX IF NOT EXISTS idx_books_sn_sort ON books(sn, sort_order);
  `);
  // Migration: add selected column to existing databases
  try { db.exec('ALTER TABLE books ADD COLUMN selected INTEGER DEFAULT 0'); } catch {}
}

function insertBook(book) {
  const stmt = getDb().prepare(`
    INSERT INTO books (book_id, sn, title, author, file_size, format, checksum, metadata_version, sort_order)
    VALUES (@book_id, @sn, @title, @author, @file_size, @format, @checksum, @metadata_version, @sort_order)
    ON CONFLICT(book_id) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      file_size = excluded.file_size,
      format = excluded.format,
      checksum = excluded.checksum,
      metadata_version = metadata_version + 1,
      updated_at = datetime('now')
  `);
  return stmt.run(book);
}

function getBooksBySn(sn) {
  return getDb().prepare(
    'SELECT * FROM books WHERE sn = ? ORDER BY sort_order ASC, created_at DESC'
  ).all(sn);
}

function getBook(bookId) {
  return getDb().prepare('SELECT * FROM books WHERE book_id = ?').get(bookId);
}

function deleteBook(bookId) {
  return getDb().prepare('DELETE FROM books WHERE book_id = ?').run(bookId);
}

function updateSortOrder(bookId, sortOrder) {
  return getDb().prepare(
    'UPDATE books SET sort_order = ?, updated_at = datetime(\'now\') WHERE book_id = ?'
  ).run(sortOrder, bookId);
}

function updateMetadata(bookId, fields) {
  const sets = [];
  const vals = {};
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = @${k}`);
    vals[k] = v;
  }
  vals.book_id = bookId;
  return getDb().prepare(
    `UPDATE books SET ${sets.join(', ')}, metadata_version = metadata_version + 1, updated_at = datetime('now') WHERE book_id = @book_id`
  ).run(vals);
}

function selectBooks(sn, bookIds) {
  const db = getDb();
  const reset = db.prepare('UPDATE books SET selected = 0 WHERE sn = ?');
  reset.run(sn);
  if (bookIds && bookIds.length > 0) {
    const set = db.prepare('UPDATE books SET selected = 1 WHERE book_id = ? AND sn = ?');
    const tx = db.transaction((ids) => {
      for (const id of ids) set.run(id, sn);
    });
    tx(bookIds);
  }
}

function getSelectedBooksBySn(sn) {
  return getDb().prepare(
    'SELECT * FROM books WHERE sn = ? AND selected = 1 ORDER BY sort_order ASC, created_at DESC'
  ).all(sn);
}

function closeDb() {
  if (db) { db.close(); db = null; }
}

module.exports = { getDb, insertBook, getBooksBySn, getBook, deleteBook, updateSortOrder, updateMetadata, selectBooks, getSelectedBooksBySn, closeDb };
