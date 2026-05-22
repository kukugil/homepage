# 变更日志

## v1.3.0 — 2026-05-22

### 修复
- **下载文件保留原始扩展名**：`bookPath` 新增 format 参数，存储和下载 URL 均带 `.txt`/`.epub`/`.pdf` 后缀，MCU 下载后可正确识别文件类型

### 修改文件
- `server/storage.js` — `bookPath(sn, bookId, format)` 支持 format 参数
- `server/routes/upload.js` — 上传时传入 format，响应 `download_url` 带扩展名
- `server/manifest.js` — manifest 中 `download_url` 带扩展名
- `server/routes/device.js` — 删除和列表 API 使用带扩展名的路径
- `test/test.js` — HEAD/Range 请求 URL 适配新格式

---

## v1.2.0 — 2026-05-20

### 修改
- **白色明亮主题**：全面切换为白底亮色风格（background: #faf9f5）
- 主题色改为蓝灰色 + 暖橙 accent，成功态改为亮绿
- film-grain 叠加层透明度降低，适配亮色背景
- 硬编码 `#5a7a4a` 改为 `--success` CSS 变量

---

## v1.1.0 — 2026-05-20

### 新增
- **PWA 支持**：添加 manifest.json、Service Worker，支持离线访问和安装到桌面
- **iOS 适配**：Apple Web App meta 标签，添加到主屏幕后全屏运行

### 修改
- 修复 header.tsx 水合错误（navigator.bluetooth 检测改用 useEffect）

---

## v1.0.0 — 2026-05-20

### 新增
- Express 后端：上传、书单、删除、排序、HTTP Range 支持
- Next.js 前端：像素风 UI、BLE 蓝牙配对、拖拽上传、可排序书单
- SQLite 数据库存储书籍元数据
- SHA256 文件完整性校验
- EPUB 封面自动提取
- Manifest 原子写入
- 集成测试（11 个用例）
