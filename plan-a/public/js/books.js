const BooksManager = {
  books: [],
  dragSrcEl: null,

  init() {
    document.getElementById('btn-refresh').addEventListener('click', () => this.loadBooks());
    document.getElementById('btn-reorder-save').addEventListener('click', () => this.saveOrder());
    window.addEventListener('books-changed', () => this.loadBooks());
  },

  getSN() {
    const bleSn = BleManager.deviceSN;
    if (bleSn) return bleSn;
    const manual = document.getElementById('sn-manual').value.trim();
    if (manual) return manual;
    return null;
  },

  async loadBooks() {
    const sn = this.getSN();
    if (!sn) {
      document.getElementById('books-list').innerHTML = '<p class="empty-state">请先连接设备或输入 SN。</p>';
      return;
    }

    try {
      const headers = {};
      const token = document.getElementById('auth-token').value.trim();
      if (document.getElementById('chk-use-token').checked && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books`, { headers });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({ error: 'Unknown' }))).error);
      const data = await resp.json();
      this.books = data.books || [];
      this.render();
    } catch (err) {
      document.getElementById('books-list').innerHTML =
        `<p class="empty-state">加载失败: ${err.message}</p>`;
    }
  },

  render() {
    const list = document.getElementById('books-list');
    if (this.books.length === 0) {
      list.innerHTML = '<p class="empty-state">暂无书籍，请先上传。</p>';
      return;
    }

    list.innerHTML = this.books.map((b, i) => `
      <div class="book-card" draggable="true" data-index="${i}" data-book-id="${b.book_id}">
        <span class="drag-handle">⋮⋮</span>
        <img class="cover-thumb" src="${b.cover_url}" alt="${this.escHtml(b.title)}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2280%22><rect fill=%22%23e0e0e0%22 width=%22100%25%22 height=%22100%25%22/></svg>'">
        <div class="book-info">
          <div class="book-title">${this.escHtml(b.title)}</div>
          <div class="book-meta">
            ${this.escHtml(b.author || '未知作者')} · ${b.format.toUpperCase()} · ${this.formatSize(b.file_size)}
          </div>
        </div>
        <div class="book-actions">
          <a href="${b.download_url}" class="btn btn-secondary btn-small" download>下载</a>
          <button class="btn btn-danger btn-small" data-action="delete" data-book-id="${b.book_id}">删除</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteBook(btn.dataset.bookId));
    });

    const cards = list.querySelectorAll('.book-card');
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => this.handleDragStart(e));
      card.addEventListener('dragover', (e) => this.handleDragOver(e));
      card.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      card.addEventListener('drop', (e) => this.handleDrop(e));
      card.addEventListener('dragend', (e) => this.handleDragEnd(e));
    });

    document.getElementById('btn-reorder-save').disabled = true;
  },

  async deleteBook(bookId) {
    const sn = this.getSN();
    if (!sn) return;
    if (!confirm('确认删除这本书？设备下次同步时将移除该书。')) return;

    try {
      const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books/${encodeURIComponent(bookId)}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('删除失败');
      this.loadBooks();
      UploadManager.showToast('书籍已删除', 'success');
    } catch (err) {
      UploadManager.showToast(`删除失败: ${err.message}`, 'error');
    }
  },

  handleDragStart(e) {
    this.dragSrcEl = e.currentTarget;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.currentTarget.dataset.bookId);
  },

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  },

  handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },

  handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const target = e.currentTarget;
    const list = document.getElementById('books-list');
    if (this.dragSrcEl && this.dragSrcEl !== target) {
      const from = parseInt(this.dragSrcEl.dataset.index);
      const to = parseInt(target.dataset.index);
      if (from < to) {
        list.insertBefore(this.dragSrcEl, target.nextSibling);
      } else {
        list.insertBefore(this.dragSrcEl, target);
      }
      const cards = list.querySelectorAll('.book-card');
      cards.forEach((c, i) => { c.dataset.index = i; });
      document.getElementById('btn-reorder-save').disabled = false;
    }
  },

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  },

  async saveOrder() {
    const sn = this.getSN();
    if (!sn) return;
    const cards = document.getElementById('books-list').querySelectorAll('.book-card');
    const bookIds = Array.from(cards).map(c => c.dataset.bookId);

    try {
      const resp = await fetch(`/api/v1/devices/${encodeURIComponent(sn)}/books/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_ids: bookIds }),
      });
      if (!resp.ok) throw new Error('保存失败');
      UploadManager.showToast('排序已保存', 'success');
      document.getElementById('btn-reorder-save').disabled = true;
      this.loadBooks();
    } catch (err) {
      UploadManager.showToast(`排序保存失败: ${err.message}`, 'error');
    }
  },

  formatSize(bytes) { return UploadManager.formatSize(bytes); },
  escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },
};

window.BooksManager = BooksManager;
