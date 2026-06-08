# 变更日志

## v1.4.0 — 2026-06-04

### 新增
- **MCU 下载协议定版**：保留 queue（JSON）作为 MCU 唯一接口，bundle 返回纯文本 URL 列表
- **下载 URL 书名支持**：URL 格式 `/dl/{SN}/books/{bookId}/{书名}.{format}`，服务端只认 bookId，文件名随意
- **Flash/TF 卡目标切换**：推送时可选择下载目标，bundle 首行返回 target 值（1=Flash, 0=TF）
- **扫码自动填入 SN**：URL 参数 `?sn=SN10001`，扫码后页面自动填入设备 SN
- **端口统一**：config.js 默认 3000，index.js 监听 3001 — 待下一版本统一
- **备案号**：页脚添加 ICP 备案号 陕ICP备2026013522号
- **33 个 API 测试**：覆盖 select/bundle/queue/status 端点
- **4 个真实文件系统测试**：上传→落盘→download_url 端到端验证
- **STORAGE_OVERRIDE 环境变量**：支持测试时使用临时存储目录

### 修复
- **文件命名改为 book_id.format**：消除重名文件的下载 URL 指向错误问题
- **上传同名文件**：book_id 唯一，不会相互覆盖
- **批量上传中文名卡住**：前端匹配从文件名改为数组下标
- **删除书籍同步清理 selectedIds**：推送计数正确更新
- **移除死依赖 ereader-book-transfer**：清理 package.json 中未使用的 file:.. 依赖 (2026-06-08)
- **清理 Demo UI 区块**：移除 page.tsx 中泄漏到生产的 UI PREVIEW 测试按钮 (2026-06-08)
- **新增 .claude/launch.json**：preview 服务器启动配置 (2026-06-08)
- **旧文件下载兼容**：/dl fallback handler 兼容旧命名格式

### 移除
- **BLE 蓝牙按钮**：不再需要，全部移除（按钮、自动连接、状态显示）
- **令牌认证**：删除形同虚设的 base64(SN) 令牌功能

### 修改文件
- `server/storage.js` — bookPath 改为 bookId+format，新增 resolveBookFilePath
- `server/db.js` — 添加 filename 列、device_config 表、setDeviceTarget/getDeviceTarget
- `server/manifest.js` — buildQueue 包含 target 字段
- `server/routes/upload.js` — 文件命名改为 bookId.format
- `server/routes/device.js` — select/bundle/queue 支持 target，download_url 新格式
- `server/app.js` — 新增 /dl/:sn/books/:bookId/:filename 路由 + 旧格式 fallback
- `server/config.js` — 移除 TOKEN_AUTH_ENABLED，添加 STORAGE_OVERRIDE
- `server/middleware.js` — 移除 validateToken
- `frontend/components/book-list-tab.tsx` — Flash/TF 切换、拖拽自动保存、按钮精简
- `frontend/components/header.tsx` — 主题切换移到标题栏、移除 BLE 按钮
- `frontend/components/upload-tab.tsx` — 移除令牌 UI、批量上传下标匹配
- `frontend/components/qr-scanner.tsx` — 原生 BarcodeDetector 替代 html5-qrcode、自动对焦
- `frontend/hooks/sn-context.tsx` — 读取 URL ?sn= 参数自动填入
- `frontend/lib/api.ts` — selectBooks 支持 target 参数、移除 authHeaders
- `test/api.test.mjs` — 从 20 增至 33 用例
- `test/api-real.test.mjs` — 新增真实文件系统集成测试（4 用例）

---

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
