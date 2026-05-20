const UploadManager = {
  uploading: false,

  init() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    const chkToken = document.getElementById('chk-use-token');
    const tokenInput = document.getElementById('auth-token');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.uploadFiles(e.dataTransfer.files);
      }
    });
    input.addEventListener('change', () => {
      if (input.files.length > 0) {
        this.uploadFiles(input.files);
        input.value = '';
      }
    });

    chkToken.addEventListener('change', () => {
      tokenInput.style.display = chkToken.checked ? '' : 'none';
    });
  },

  getSN() {
    const bleSn = BleManager.deviceSN;
    if (bleSn) return bleSn;
    const manual = document.getElementById('sn-manual').value.trim();
    if (manual) return manual;
    return null;
  },

  async uploadFiles(fileList) {
    const sn = this.getSN();
    if (!sn) {
      this.showToast('请先通过蓝牙连接设备或手动输入 SN', 'error');
      return;
    }
    if (this.uploading) { this.showToast('正在上传中，请稍候', 'error'); return; }

    this.uploading = true;
    const files = Array.from(fileList);
    const totalBytes = files.reduce((s, f) => s + f.size, 0);

    document.getElementById('upload-progress').classList.remove('hidden');
    document.getElementById('upload-results').innerHTML = '';

    if (files.length === 1) {
      await this.uploadSingle(sn, files[0], totalBytes);
    } else {
      await this.uploadBatch(sn, files, totalBytes);
    }

    this.uploading = false;
    document.getElementById('upload-progress').classList.add('hidden');
    window.dispatchEvent(new CustomEvent('books-changed'));
  },

  async uploadSingle(sn, file, totalBytes) {
    const formData = new FormData();
    formData.append('sn', sn);
    formData.append('file', file);

    const headers = {};
    if (document.getElementById('chk-use-token').checked) {
      const token = document.getElementById('auth-token').value.trim();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const xhr = new XMLHttpRequest();
      const result = await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) this.updateProgress(e.loaded, totalBytes, `上传中: ${file.name}`);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error)); }
            catch { reject(new Error(`上传失败 (${xhr.status})`)); }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.addEventListener('abort', () => reject(new Error('上传已取消')));
        xhr.open('POST', '/api/v1/books/upload');
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.send(formData);
      });

      document.getElementById('upload-results').innerHTML +=
        `<div class="upload-result-item success">${file.name} — 上传成功 (${result.book_id})</div>`;
      this.showToast(`${file.name} 上传成功`, 'success');
    } catch (err) {
      document.getElementById('upload-results').innerHTML +=
        `<div class="upload-result-item error">${file.name} — ${err.message}</div>`;
      this.showToast(`${file.name} 上传失败: ${err.message}`, 'error');
    }
  },

  async uploadBatch(sn, files, totalBytes) {
    const formData = new FormData();
    formData.append('sn', sn);
    files.forEach(f => formData.append('files', f));

    const headers = {};
    if (document.getElementById('chk-use-token').checked) {
      const token = document.getElementById('auth-token').value.trim();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const xhr = new XMLHttpRequest();
      const result = await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) this.updateProgress(e.loaded, totalBytes, `批量上传中: ${files.length} 个文件`);
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).error)); }
            catch { reject(new Error(`上传失败 (${xhr.status})`)); }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('网络错误')));
        xhr.open('POST', '/api/v1/books/batch-upload');
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
        xhr.send(formData);
      });

      const resultsDiv = document.getElementById('upload-results');
      result.results.forEach(r => {
        const cls = r.status === 'ok' ? 'success' : 'error';
        resultsDiv.innerHTML +=
          `<div class="upload-result-item ${cls}">${r.filename} — ${r.status === 'ok' ? '成功' : r.reason}</div>`;
      });
      this.showToast(`完成: ${result.success_count} 成功, ${result.fail_count} 失败`, result.fail_count > 0 ? 'error' : 'success');
    } catch (err) {
      this.showToast(`批量上传失败: ${err.message}`, 'error');
    }
  },

  updateProgress(loaded, total, text) {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = `${Math.min(pct, 100)}%`;
    document.getElementById('progress-text').textContent =
      `${text} (${this.formatSize(loaded)} / ${this.formatSize(total)})`;
  },

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(1)} GB`;
  },

  showToast(msg, type) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  },
};

window.UploadManager = UploadManager;
