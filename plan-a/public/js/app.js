(function () {
  const snDisplay = document.getElementById('sn-display');
  const btnConnect = document.getElementById('btn-connect-ble');
  const snManual = document.getElementById('sn-manual');

  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'books') {
        BooksManager.loadBooks();
      }
    });
  });

  // BLE Connect
  btnConnect.addEventListener('click', async () => {
    btnConnect.disabled = true;
    btnConnect.textContent = '连接中...';
    try {
      const sn = await BleManager.connect();
      snDisplay.textContent = sn;
      snDisplay.classList.add('connected');
      btnConnect.textContent = '已连接';
      snManual.style.display = 'none';
    } catch (err) {
      UploadManager.showToast(err.message, 'error');
      snDisplay.textContent = '连接失败';
      btnConnect.textContent = '重试连接';
      btnConnect.disabled = false;
      snManual.style.display = '';
    }
  });

  // Manual SN entry
  snManual.addEventListener('input', () => {
    const v = snManual.value.trim();
    if (v) {
      snDisplay.textContent = v;
      snDisplay.classList.add('connected');
    } else {
      snDisplay.textContent = BleManager.deviceSN || '未连接';
      snDisplay.classList.toggle('connected', !!BleManager.deviceSN);
    }
  });

  // SN changed events
  window.addEventListener('sn-changed', (e) => {
    if (e.detail) {
      snDisplay.textContent = e.detail;
      snDisplay.classList.add('connected');
      btnConnect.textContent = '已连接';
      btnConnect.disabled = false;
      snManual.style.display = 'none';
    } else {
      snDisplay.textContent = '连接断开';
      snDisplay.classList.remove('connected');
      btnConnect.textContent = '连接设备';
      btnConnect.disabled = false;
    }
  });

  // Initialize sub-modules
  UploadManager.init();
  BooksManager.init();

  // If BLE not available, show manual input
  if (!navigator.bluetooth) {
    btnConnect.style.display = 'none';
    snManual.style.display = '';
    snDisplay.textContent = '输入 SN';
  }
})();
