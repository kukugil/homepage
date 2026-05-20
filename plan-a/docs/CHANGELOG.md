# 变更日志

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
