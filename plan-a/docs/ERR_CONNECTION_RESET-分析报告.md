# ERR_CONNECTION_RESET 问题分析报告

## 问题现象

浏览器访问 `https://ereader.fun`，输入 SN 后调用 `/api/v1/devices/:sn/books`，控制台报错：

```
GET https://ereader.fun/api/v1/devices/SN001/books net::ERR_CONNECTION_RESET
```

特征：**间歇性**——"有时候可以加载，有时候报错"。

## 排查过程

### 1. Nginx `Connection: upgrade` 无条件设置

**发现**：`/etc/nginx/sites-enabled/ereader` 中 `proxy_set_header Connection "upgrade"` 被无条件设置。

**原理**：非 WebSocket 的普通 HTTP 请求也会收到 `Connection: upgrade` 响应头。浏览器收到此头后期望协议升级到 WebSocket，实际不会升级，导致协议不匹配。严格遵循 HTTP 规范的客户端会因此重置连接。

**修复**：将 `proxy_set_header Connection "upgrade"` 改为 `proxy_set_header Connection ""`（空）。后续直接移除了整个 `proxy_set_header Connection` 和 `proxy_set_header Upgrade` 行，因为该项目不使用 WebSocket。

**结果**：修复后服务器端 HTTPS API 测试全部返回 200。但用户问题依旧。

### 2. Express 进程反复崩溃（EADDRINUSE）

**发现**：PM2 日志显示 25 分钟内重启了 50 次：

```
Error: listen EADDRINUSE: address already in use :::3001
```

**根因**：
- `app.listen(port)` 默认监听 `::`（IPv6），PM2 fork 模式下旧进程未完全释放端口
- SIGINT/SIGTERM 处理中没有先 `server.close()` 再退出，端口释放不及时
- `uncaughtException` 直接 `process.exit(1)`，导致连接中的请求被粗暴断开

**修复**：
- `app.listen(port, '0.0.0.0')` 显式绑定 IPv4，避免 IPv6 双栈冲突
- 实现 `gracefulShutdown()`：先 `server.close()` 回调中 `process.exit(0)`，加 5 秒超时兜底
- `uncaughtException` 改为调用 `gracefulShutdown()`
- `server.keepAliveTimeout = 120000` 和 `server.headersTimeout = 120000`，防止连接过早关闭

**结果**：PM2 重启计数归零，进程稳定运行。但用户问题依旧。

### 3. Service Worker fetch 错误处理缺失

**发现**：`sw.js` 中 fetch 失败时没有 `.catch()` 处理：

```js
const fetched = fetch(event.request).then((response) => { ... })
return cached || fetched  // fetched 出错时整个 respondWith 的 promise 被 reject
```

**修复**：升级到 SW v3：
- 添加 `.catch(() => cached || new Response('Offline', { status: 408 }))`
- 缓存名前缀改为 `ereader-v3` 自动清除旧缓存
- 缓存策略改为 cache-first（有缓存直接返回，不再重复 fetch）

**结果**：SW v3 不再抛出 `Uncaught (in promise) TypeError`。但 API 的 `ERR_CONNECTION_RESET` 依旧。

### 4. 无防抖导致请求泛滥

**发现**：`book-list-tab.tsx` 中 `useEffect` 依赖 `deviceSN`，每个字符输入都即刻触发 `fetchBooks()`：

```
S → /api/v1/devices/S/books
SN → /api/v1/devices/SN/books
SN0 → /api/v1/devices/SN0/books
SN00 → /api/v1/devices/SN00/books
SN001 → /api/v1/devices/SN001/books
```

快速输入 5 个字符同时发起 5 个请求，Chrome 取消前面未完成的请求时标记为 `ERR_CONNECTION_RESET`。

**修复**：
- 添加 500ms 防抖（`debounceRef` + `setTimeout`）
- 添加 `AbortController` 在发起新请求前取消旧请求
- `fetchBooks()` 支持 `signal` 参数传递给 `fetch` API
- 区分 `AbortError`（静默忽略）和真正的网络错误

**结果**：从调用栈看 `setTimeout` 已生效，单次请求而非多次并发。但问题依旧。

### 5. API 响应被浏览器缓存（304 + ETag）

**发现**：Nginx access log 中 API 请求返回 304：

```
GET /api/v1/devices/SN001/books HTTP/1.1" 304 0
```

Express 默认给 `res.json()` 自动添加 `ETag`。浏览器缓存了带 ETag 的响应，后续请求带上 `If-None-Match`，服务端返回 304（空 body）。

**修复**：
- `app.set('etag', false)` 全局禁用 Express 自动 ETag
- 为 `/api` 路由添加中间件：`Cache-Control: no-store, no-cache, must-revalidate`
- `res.removeHeader('ETag')` 显式移除

**结果**：API 响应头确认为 `Cache-Control: no-store, no-cache, must-revalidate`，无 ETag。但用户问题依旧。

### 6. TLS 握手失败（外部访问）

**发现**：从我本地 Windows 机器 curl 测试时：

```
* schannel: AcquireCredentialsHandle failed: SEC_E_ALGORITHM_MISMATCH
* Recv failure: Connection was reset
```

**分析**：
- 服务器证书使用 ECDSA P-256 密钥
- TLS 配置仅允许 `TLSv1.2` 和 `TLSv1.3`
- 密码套件仅 8 个现代 GCM/CHACHA20 套件
- Windows 10 build 18363 (2019) 的 schannel 不支持当前 TLS 配置
- Chrome 使用 BoringSSL，**不受 schannel 限制**

**结论**：这解释了为什么我的 curl 失败，但不影响 Chrome 用户。**Chrome 用户页面可正常加载（HTML/JS/CSS 均 200），证明 Chrome 的 TLS 栈正常工作。**

### 7. 关键发现：API 请求未到达服务器

后期 Nginx access log 中不再出现 `/api/v1/` 请求记录——用户的页面请求、JS 文件请求均正常记录，但 API 请求消失了。

这意味着 `ERR_CONNECTION_RESET` 发生在**请求到达服务器之前**。可能原因：

1. **Service Worker 拦截并损坏请求**：SW 注册在 `ereader.fun` 作用域下，虽然代码跳过 `/api/` 路径，但若浏览器运行的仍是旧版 SW，行为不可预期
2. **浏览器连接池复用失效**：页面加载使用 HTTP/1.1 keepalive 连接，500ms 防抖后复用同一连接，若中间设备（NAT/防火墙）已关闭该空闲连接，浏览器发送请求时收到 RST
3. **浏览器内部缓存/http缓存状态异常**：之前 304 缓存的残留导致请求栈异常

## 当前状态

| 层次 | 状态 |
|------|------|
| Express 进程 | 稳定，0 次异常重启 |
| 端口监听 | 仅一个进程，0.0.0.0:3001 |
| Nginx 代理 | 配置清理完毕，无 Upgrade/Connection 头干扰 |
| API 缓存头 | `no-store, no-cache, must-revalidate`，无 ETag |
| 前端防抖 | 500ms debounce + AbortController |
| Service Worker | v3，有错误处理，cache-first 策略 |
| www 重定向 | 全部 4 条链路 → ereader.fun |
| SSL 证书 | ECDSA P-256，Let's Encrypt，覆盖 ereader.fun + www |

## 待验证的假设

**最可能的根因：浏览器端残留的旧 Service Worker 或缓存。**

验证步骤：
1. 无痕模式访问 `https://ereader.fun`——绕过 SW
2. 若无痕模式正常，注销 SW：`chrome://serviceworker-internals/`
3. 清除浏览器缓存
4. 关闭所有标签页后重新打开

若以上仍不能解决，需进一步排查：
- 用户网络环境的中间设备（代理/VPN/防火墙）
- Chrome net-export 日志分析 TCP 层 RST 来源
