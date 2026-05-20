# 蓝牙 MCU 电子阅读器 — 书籍无线传输方案技术设计文档

## 1. 背景

本项目为蓝牙 MCU 电子阅读器提供书籍无线传输解决方案。设备通过蓝牙 PAN 功能，经由手机蓝牙热点访问互联网。用户通过 WEB 应用上传书籍，后台服务生成书单索引（Manifest），设备端通过固定规则的 URL 拉取书单并逐本下载。

### 1.2 设计约束

| 约束项 | 决策 | 说明 |
|---|---|---|
| 网络方式 | 蓝牙PAN + 手机热点 → 互联网 | 设备通过手机热点获取 IP 地址，直连公网 |
| 设备系统 | RTOS，HTTP/HTTPS 协议栈 | 纯 HTTP 通信，无 MQTT 依赖 |
| 书籍文件 | 50MB+，需断点续传 | HTTP Range 支持 |
| 账号模型 | SN 即身份 | 无需用户注册登录 |
| 格式处理 | 直传，不做转换 | 设备支持 EPUB/PDF/TXT 等通用格式 |
| 封面需求 | 需要缩略图 | 设备端有书架 UI |

---

## 2. 框架层面关键设计选型

### 2.1 SN 寻址模型

设备通过 SN 按固定规则拼出 URL，无需服务端动态下发地址：

```
https://host/dl/{SN}/manifest.json          ← 书单索引（几 KB）
https://host/dl/{SN}/books/{book_id}         ← 具体书籍文件
https://host/dl/{SN}/covers/{book_id}.jpg    ← 封面缩略图
```

优点：
- 设备出厂只需烧录一个 Base URL（如 `https://reader.example.com/dl/`）+ SN
- 上电后拼接 SN 得到 manifest.json，GET 后即知所有可下载的书
- 服务端实现简单——本质是规则化的静态文件 + 上传时动态生成 manifest

### 2.2 书单发现机制

#### 方案一：Manifest 模式

设备上电联网后流程：

1. GET /dl/{SN}/manifest.json → 拿到书单（含书名、大小、下载地址、封面地址）
2. 解析 JSON，对比本地已有书籍
3. 对"新书/未下载"的书按需逐本下载
4. 下载时可用 Range 做断点续传

Manifest JSON 结构（设备视角，几 KB）：

```json
{
  "sn": "SN001",
  "updated_at": "2026-05-19T12:00:00Z",
  "books": [
    {
      "book_id": "b_abc123",
      "title": "三体",
      "author": "刘慈欣",
      "file_size": 52428800,
      "format": "epub",
      "checksum": "sha256:a1b2c3d4...",
      "cover_url": "https://host/dl/SN001/covers/b_abc123.jpg",
      "download_url": "https://host/dl/SN001/books/b_abc123"
    }
  ]
}
```

#### 方案二：目录列举模式

设备请求目录列表，后台返回该 SN 目录下的文件清单。设备解析文件列表后逐本下载。

基本流程：

1. GET /dl/{SN}/ → 服务端返回该 SN 目录下的文件清单（书籍文件列表）
2. 设备解析响应，提取文件名、大小等基本信息
3. 与本地已有书籍对比，决定新增/更新/删除
4. 按需逐本下载

与 Manifest 模式的关键区别：
- 无索引文件：不需要后台维护 manifest.json，每次实时列举目录
- 信息有限：目录列举通常只能返回文件名、大小、修改时间，无法携带书名、作者、封面等元数据（除非约定命名规则）
- 实现简单：服务端只需开启目录索引（如 Nginx autoindex），无需额外开发

#### 三种方案对比

| 维度 | Manifest 模式 | 目录列举模式 | 长轮询模式 |
|---|---|---|---|
| MCU 实现难度 | 极低（GET + JSON） | 低（GET + 解析目录列表） | 中（长连接管理、超时重连） |
| 服务端复杂度 | 极低（静态文件服务） | 极低（目录索引即可） | 中（hold 连接、状态管理） |
| 实时性 | 轮询间隔级（如 30s） | 轮询间隔级（如 30s） | 准实时 |
| 离线兼容 | 天然（manifest 即状态快照） | 一般（需本地维护状态） | 需额外设计 |
| 扩展性 | 极好（CDN 直接缓存） | 好（可缓存目录列表） | 一般 |
| 调试成本 | 极低（curl + 浏览器即可） | 极低（浏览器直接访问） | 中 |

推荐 Manifest 模式：MCU 解析 JSON 就够了，服务端本质是静态文件服务 + 上传时写 manifest。目录列举模式虽然实现更简单，但无法携带书籍元数据（书名、作者、封面），设备端无法获取丰富的书架展示信息。

---

## 3. 系统架构

### 3.1 架构图

```
┌──────────────────┐        HTTPS        ┌──────────────────────────┐
│   WEB 前端 (SPA)  │ ──────────────────▶ │                          │
│                  │ ◀────────────────── │    后台服务               │
│  · SN 输入       │                     │                          │
│  · 文件上传      │                     │  · POST /upload（写文件）  │
│  · 书籍管理      │                     │  · 自动生成 manifest.json │
└──────────────────┘                     │  · 自动提取封面           │
                                         │  · 静态文件服务 /dl/      │
                                         └──────────┬───────────────┘
                                                    │
┌──────────────────┐        HTTPS                    │
│  蓝牙 MCU 设备    │ ──────────────────────────────▶│
│                  │ ◀──────────────────────────────│
│  · GET manifest  │                                │
│  · 解析 JSON     │                     ┌──────────▼───────────┐
│  · Range 下载    │                     │  文件存储（规则化）    │
│  · 本地对比      │                     │  /dl/{SN}/            │
└──────────────────┘                     │    manifest.json      │
                                         │    books/             │
                                         │    covers/            │
                                         └──────────────────────┘
```

### 3.2 技术选型

| 层次 | 技术 | 理由 |
|---|---|---|
| 后台框架 | Node.js + Express | 文件操作友好、Range 支持原生、静态文件服务内建 |
| 文件上传 | multer | Express 标准中间件 |
| 封面提取 | jszip（EPUB）/ 默认封面（PDF/TXT） | EPUB 即 ZIP，可直接提取封面图 |
| 前端 | 原生 HTML/CSS/JS | 零构建、轻量部署 |
| 设备发现 | Manifest JSON 文件 | MCU 只需 GET + JSON parse |
| 文件下载 | HTTP Range（206） | 标准断点续传 |
| 文件组织 | 按 SN 目录规则化存储 | 上传即写文件 + 更新 manifest |

---

## 4. URL 与文件组织

### 4.1 完整 URL 体系

设备端（只读）:
- GET  /dl/{SN}/manifest.json → 书单索引
- GET  /dl/{SN}/books/{book_id} → 书籍文件（支持 Range）
- GET  /dl/{SN}/covers/{book_id}.jpg → 封面缩略图

WEB 端（读写）:
- POST   /api/v1/books/upload → 上传单本书
- POST   /api/v1/books/batch-upload → 批量上传
- GET    /api/v1/devices/{SN}/books → 查看设备书籍列表
- DELETE /api/v1/devices/{SN}/books/{book_id} → 删除书籍
- PUT    /api/v1/devices/{SN}/books/{book_id}/priority → 调整顺序

### 4.2 服务端文件结构

```
storage/
└── dl/
    └── {SN}/
        ├── manifest.json          ← 书单索引（每次上传/删除后重写）
        ├── books/
        │   ├── {book_id}          ← 书籍原始文件（即上传的文件）
        │   └── {book_id}
        └── covers/
            ├── {book_id}.jpg      ← 封面缩略图（300×400）
            └── {book_id}.jpg
```

manifest.json 生成规则：扫描 books/ 目录下所有文件，结合元数据数据库，每次上传/删除后全量重写 manifest.json。

---

## 5. 核心模块设计

### 5.1 Manifest 生成模块

上传完成一本书后触发：

1. 存储文件到 /dl/{SN}/books/{book_id}
2. 提取/生成封面到 /dl/{SN}/covers/{book_id}.jpg
3. 写入元数据到数据库（书名、作者、大小、checksum 等）
4. 重新生成 /dl/{SN}/manifest.json（全量扫描该 SN 的 books + 元数据）

manifest.json 结构：

```json
{
  "sn": "SN001",
  "updated_at": "2026-05-19T12:00:00Z",
  "books": [
    {
      "book_id": "b_abc123",
      "title": "三体",
      "author": "刘慈欣",
      "file_size": 52428800,
      "format": "epub",
      "checksum": "sha256:a1b2c3d4e5f6...",
      "cover_url": "/dl/SN001/covers/b_abc123.jpg",
      "download_url": "/dl/SN001/books/b_abc123",
      "added_at": "2026-05-19T10:00:00Z"
    }
  ]
}
```

### 5.2 断点续传 —— HTTP Range

设备 GET 书籍文件时携带 Range 请求头：

首次下载（从头开始）：
```
GET /dl/SN001/books/b_abc123
→ 200 OK, Content-Length: 52428800
```

断点续传（从 10MB 处继续）：
```
GET /dl/SN001/books/b_abc123
Range: bytes=10485760-
→ 206 Partial Content
  Content-Range: bytes 10485760-52428799/52428800
  Content-Length: 41943040
```

获取文件大小（不下载）：
```
HEAD /dl/SN001/books/b_abc123
→ 200 OK, Content-Length: 52428800, Accept-Ranges: bytes
```

设备端伪代码：

```c
int download_book(const char *base_url, const char *sn, book_meta_t *book) {
    char url[256];
    snprintf(url, sizeof(url), "%s/dl/%s/books/%s", base_url, sn, book->book_id);

    // 1. 获取文件总大小
    uint32_t total = http_head_size(url);

    // 2. 读本地 Flash 已下载偏移量
    uint32_t offset = flash_read_progress(book->book_id);

    // 3. 打开/创建本地文件（追加模式）
    FILE *fp = fopen(book->local_path, offset == 0 ? "wb" : "ab");

    // 4. Range 下载循环
    while (offset < total) {
        http_range_download(url, offset, write_chunk_cb, fp);
        offset = ftell(fp);
        flash_save_progress(book->book_id, offset);

        // 每 1MB 上报一次进度（可选）
        if (offset % (1024*1024) == 0) {
            http_post("/api/v1/progress", ...);  // 可选
        }
    }

    // 5. 校验
    uint8_t actual_hash[32];
    sha256_file(book->local_path, actual_hash);
    if (memcmp(actual_hash, book->checksum, 32) != 0) {
        // 校验失败，删除并重置
        remove(book->local_path);
        flash_save_progress(book->book_id, 0);
        return -1;
    }

    flash_clear_progress(book->book_id);
    fclose(fp);
    return 0;
}
```

### 5.3 封面缩略图

| 格式 | 提取方式 |
|---|---|
| EPUB | 用 ZIP 库读取内部 META-INF/container.xml → 定位 OPF → 找到 cover 图片 → 缩放至 300×400 |
| PDF | 用 PDF 库渲染首页 → 缩放到 300×400（可选，较复杂；可先用默认封面） |
| TXT | 生成默认封面（纯色背景 + 书名文字，使用 canvas/Skia 等服务端渲染） |
| 无封面 | 使用预设默认封面 /dl/{SN}/covers/_default.jpg |

封面大小：300×400 px JPEG，质量 70%，< 30KB。

### 5.4 多书籍场景

**设备端下载策略**

设备上电 / 定时轮询:
1. GET manifest.json
2. 解析 books[] 数组
3. 与本地已下载列表 diff:
   - manifest 有、本地无 → 新书，加入下载队列
   - manifest 有、本地有但 checksum 不同 → 更新，重新下载
   - manifest 无、本地有 → 用户在 WEB 端已删除，清理本地文件
4. 按 manifest 中的顺序逐本下载（用户可在 WEB 端调序）
5. 每本先下封面（小图，快速更新书架 UI），再下正文

**WEB 端书籍管理**

- 书籍列表按上传时间倒序，显示每本书的下载状态
- 支持拖拽排序（重排 manifest 中 books 数组顺序 → 重写 manifest）
- 删除书籍时：删除文件 + 重写 manifest
- 批量上传时：逐本处理，单本失败不影响其他

---

## 6. API 接口规范

### 6.1 设备端接口（只读，静态文件服务）

**GET /dl/{SN}/manifest.json**
返回该书单索引（JSON）

**GET /dl/{SN}/books/{book_id}**
返回书籍文件，支持 Range: bytes=N-
支持 HEAD 获取文件大小

**GET /dl/{SN}/covers/{book_id}.jpg**
返回封面缩略图

### 6.2 WEB 端接口

**上传单本书**

```
POST /api/v1/books/upload
Content-Type: multipart/form-data

参数: sn, file

响应 200:
{
  "book_id": "b_abc123",
  "title": "三体",
  "author": "刘慈欣",
  "file_size": 52428800,
  "format": "epub",
  "cover_url": "/dl/SN001/covers/b_abc123.jpg"
}
```

**批量上传**

```
POST /api/v1/books/batch-upload
Content-Type: multipart/form-data

参数: sn, files[]

响应 200:
{
  "results": [
    { "filename": "三体.epub", "status": "ok", "book_id": "b_001" },
    { "filename": "损坏.epub", "status": "error", "reason": "文件解析失败" }
  ],
  "success_count": 1,
  "fail_count": 1
}
```

**查看设备书籍**

```
GET /api/v1/devices/{SN}/books

响应 200:
{
  "sn": "SN001",
  "books": [
    {
      "book_id": "b_001",
      "title": "三体",
      "author": "刘慈欣",
      "file_size": 52428800,
      "format": "epub",
      "cover_url": "/dl/SN001/covers/b_001.jpg",
      "download_url": "/dl/SN001/books/b_001",
      "created_at": "2026-05-19T10:00:00Z"
    }
  ]
}
```

**删除书籍**

```
DELETE /api/v1/devices/{SN}/books/{book_id}
→ 删除文件 + 删除封面 + 重写 manifest

响应 200: { "deleted": true }
```

**调整书籍顺序**

```
PUT /api/v1/devices/{SN}/books/reorder
Content-Type: application/json

{ "book_ids": ["b_003", "b_001", "b_002"] }

→ 重写 manifest，books 数组按此顺序排列
响应 200: { "ok": true }
```

---

## 7. 数据存储设计

### 7.1 数据库（元数据）

```sql
CREATE TABLE books (
    book_id     TEXT PRIMARY KEY,
    sn          TEXT NOT NULL,
    title       TEXT DEFAULT '未知书名',
    author      TEXT DEFAULT '未知作者',
    file_size   INTEGER NOT NULL,
    format      TEXT NOT NULL,
    checksum    TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_books_sn ON books(sn);
```

### 7.2 文件存储

文件按 {SN} 目录规则化组织，manifest.json 随上传/删除实时重写。
存储层与接口层独立，后续可平滑切换到 OSS/S3。

---

## 8. 关键业务流程

### 8.1 用户上传一本书的完整链路

```
WEB端                    后台                          文件系统              设备端
  │                       │                              │                    │
  │─POST /upload─────────▶│                              │                    │
  │  (sn=SN001, file)     │                              │                    │
  │                       │─存储文件────────────────────▶│ /dl/SN001/books/   │
  │                       │─提取封面────────────────────▶│ /dl/SN001/covers/  │
  │                       │─写入 books 表               │                    │
  │                       │─重写 manifest.json─────────▶│ /dl/SN001/         │
  │◀──上传成功────────────│                              │                    │
  │                       │                              │                    │
  │                       │                              │ ◀── GET manifest ──│ (定时轮询)
  │                       │                              │ ── 返回 JSON ────▶│
  │                       │                              │                    │──对比本地，发现新书
  │                       │                              │                    │
  │                       │                              │ ◀── GET /cover ───│
  │                       │                              │ ── 封面图 ───────▶│──更新书架UI
  │                       │                              │                    │
  │                       │                              │ ◀── GET /book ────│
  │                       │                              │    Range: bytes=0- │
  │                       │                              │ ── 206 + 数据 ───▶│──写入Flash
  │                       │                              │                    │
  │                       │                              │  ...循环至完成...   │
```

### 8.2 断点续传恢复

设备重连后:
1. GET manifest.json → books[] 数组
2. 与本地对比 → 找到未完成的书
3. 读 Flash 偏移量 → 如 offset=10485760
4. GET /dl/SN001/books/b_abc123  Range: bytes=10485760-
5. 追加写入 → 更新偏移量
6. 完成后 SHA256 校验

### 8.3 多书上传失败隔离

用户上传 5 本书 → 后台逐本处理:
- 书1: 存储OK → 封面OK → book_id 入库 ✓
- 书2: 存储OK → 封面OK → book_id 入库 ✓
- 书3: 存储失败（网络超时）→ 跳过 ✗
- 书4: 存储OK → 封面失败 → 用默认封面 → 入库 ✓ (带默认封面)
- 书5: 格式不支持 → 拒绝 ✗

最后统一重写一次 manifest.json（含书1、书2、书4）
返回: success_count=3, fail_count=2 (含逐条失败原因)

---

## 9. 设备端接入清单

| 序号 | 能力 | 实现要点 |
|---|---|---|
| 1 | HTTP GET | 拉取 manifest.json |
| 2 | HTTP HEAD | 获取文件大小（Content-Length） |
| 3 | HTTP Range GET | 断点续传下载，解析 206 响应和 Content-Range 头 |
| 4 | JSON 解析 | 解析 manifest.json 中的 books 数组 |
| 5 | 文件追加写入 | fopen(path, "ab") |
| 6 | Flash KV 存储 | 持久化 book_id → downloaded_bytes |
| 7 | SHA256 校验 | 下载完成后整文件校验 |
| 8 | 定时轮询 | 每 N 秒 GET manifest.json 检查书单变化 |
| 9 | diff 逻辑 | manifest books[] ↔ 本地目录对比，决定新增/更新/删除 |

MCU 侧设备主循环伪代码：

```c
#define POLL_INTERVAL_SEC 30
#define MANIFEST_URL  "https://host/dl/%s/manifest.json"

void device_main_loop() {
    while (1) {
        // 1. 拉 manifest
        char url[128];
        snprintf(url, sizeof(url), MANIFEST_URL, g_sn);
        manifest_t *m = http_get_json(url);  // GET + 解析 JSON

        // 2. 对比本地
        diff_result_t diff = compare_with_local(m);

        // 3. 处理新增/更新
        for (int i = 0; i < diff.new_count; i++) {
            download_cover(diff.new_books[i]);
            download_book_with_resume(diff.new_books[i]);
        }

        // 4. 清理已删除
        for (int i = 0; i < diff.deleted_count; i++) {
            remove_local_book(diff.deleted_books[i]);
        }

        // 5. 等待下次轮询
        sleep(POLL_INTERVAL_SEC);
    }
}
```

---

## 10. 安全设计

| 措施 | 说明 |
|---|---|
| SN 路径隔离 | 每个 SN 只能访问自己的 /dl/{SN}/ 目录 |
| 文件类型白名单 | 仅允许 .epub / .pdf / .txt |
| 文件大小上限 | 默认 500MB |
| 文件名过滤 | 移除 ../、\ 等路径遍历字符 |
| HTTPS | 生产环境强制 TLS 1.2+ |

---

## 11. 部署架构

```
┌──────────────────────────────────────────┐
│  VPS / 云主机                             │
│                                          │
│  ┌────────────┐  ┌────────────────────┐  │
│  │  Nginx     │  │  Node.js App       │  │
│  │  :443      │──│  :3000             │  │
│  │            │  │                    │  │
│  │ /dl/*      │  │  POST /api/v1/*    │  │
│  │ (直接serve)│  │  (写文件+写manifest)│  │
│  └────────────┘  │                    │  │
│                  │  SQLite (元数据)    │  │
│                  └────────────────────┘  │
│                                          │
│  storage/dl/{SN}/                        │
│    manifest.json                         │
│    books/                                │
│    covers/                               │
└──────────────────────────────────────────┘
```

/dl/* 路径可直接由 Nginx serve（静态文件），或由 Express 的 express.static() 提供。只有上传接口需要经过 Node.js 应用逻辑。

---

## 附录：三种书单发现模式对比总结

| 维度 | Manifest 模式 ✓ | 目录列举模式 | 长轮询模式 |
|---|---|---|---|
| MCU 实现难度 | 极低（GET + JSON） | 低（GET + 解析目录列表） | 中（长连接管理、超时重连） |
| 服务端复杂度 | 极低（静态文件服务） | 极低（目录索引即可） | 中（hold 连接、状态管理） |
| 实时性 | 轮询间隔级（如 30s） | 轮询间隔级（如 30s） | 准实时 |
| 离线兼容 | 天然（manifest 即状态快照） | 一般（需本地维护状态） | 需额外设计 |
| 扩展性 | 极好（CDN 直接缓存） | 好（可缓存目录列表） | 一般 |
| 调试成本 | 极低（curl + 浏览器即可） | 极低（浏览器直接访问） | 中 |

**推荐 Manifest 模式**：综合最优，MCU 只需 GET + JSON 解析，服务端本质是静态文件服务 + 上传时写 manifest。目录列举模式虽然实现更简单，但无法携带书籍元数据（书名、作者、封面），设备端无法获取丰富的书架展示信息。长轮询模式仅在需要准实时推送的场景下考虑。
