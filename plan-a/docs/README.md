# E-Reader Book Transfer System

基于 Node.js + Next.js 的蓝牙 MCU 电子阅读器书籍无线传输系统。

## 系统架构

```
plan-a/
├── server/           # Express 后端（API + 静态文件 + 书单生成）
│   ├── index.js      # 入口，端口 3001
│   ├── config.js     # 配置
│   ├── db.js         # SQLite 数据库
│   ├── storage.js    # 文件存储 + SHA256
│   ├── manifest.js   # 书单生成
│   ├── cover.js      # EPUB 封面提取
│   ├── middleware.js  # 中间件（SN校验、令牌、限流）
│   └── routes/
│       ├── upload.js  # 上传 API
│       └── device.js  # 设备管理 API
├── frontend/         # Next.js 16 + React 19 前端
│   ├── app/          # App Router 页面
│   ├── components/   # UI 组件（像素风主题）
│   ├── hooks/        # BLE 连接 + SN 状态管理
│   ├── lib/          # API 客户端
│   └── public/       # 静态资源 + PWA
├── public/           # 旧版前端（已弃用）
├── test/             # 集成测试
└── docs/             # 文档
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/books/upload` | 上传单本书 |
| POST | `/api/v1/books/batch-upload` | 批量上传 |
| GET | `/api/v1/devices/:sn/books` | 查询设备书单 |
| DELETE | `/api/v1/devices/:sn/books/:bookId` | 删除书籍 |
| PUT | `/api/v1/devices/:sn/books/reorder` | 排序 |
| GET | `/dl/:sn/manifest.json` | 设备端书单 |
| GET | `/dl/:sn/books/:bookId.:format` | 下载书籍（支持 Range，文件保留原始扩展名 .txt/.epub/.pdf） |

## 快速启动

### 开发模式

```bash
# 终端 1：Express 后端
cd plan-a
npm install
npm start                # 端口 3001

# 终端 2：Next.js 前端
cd plan-a/frontend
npm install
npm run dev              # 端口 3000
```

浏览器打开 `http://localhost:3000`

### 生产模式

```bash
cd plan-a/frontend
npm run build            # 输出到 frontend/out/
cd ..
npm start                # Express 自动 serve 构建产物
```

### 运行测试

```bash
# 确保后端在 3001 端口运行
node test/test.js
```

## BLE 蓝牙连接

支持通过 Web Bluetooth API 自动读取 MCU 序列号：

- **PC**：Chrome / Edge 浏览器
- **Android**：Chrome 浏览器
- **iPhone**：不支持（需手动输入 SN）

MCU 要求：
- BLE 4.0+
- 暴露 Device Information Service (UUID: `0000180a`)
- 或自定义服务 (UUID: `12345678-1234-1234-1234-123456789abc`)
- Serial Number 格式：`/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/`

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | Express 端口 |
| `TOKEN_AUTH` | `false` | 是否启用令牌认证 |

## 技术栈

- **后端**：Express 4 + better-sqlite3 + multer + sharp + JSZip
- **前端**：Next.js 16 + React 19 + shadcn/ui + Tailwind CSS 4
- **存储**：文件系统 + SQLite
- **通信**：Web Bluetooth API + REST API
