# WiFi 异常自愈能力测试

验证 Android 设备在 WiFi 异常情况下，通过「开关 WiFi」或「飞行模式切换」能否自动恢复，无需重启设备。

## 测试原理

```
采集基线 (AP 数、连接状态)
    ↓
注入故障 (随机: 杀 wpa_supplicant / 卡死 wpa_supplicant / 杀 wificond)
    ↓
方案一: 关闭 WiFi → 等 3s → 打开 WiFi → 验证
    ├→ 恢复成功 → 记录方案一 OK, 方案二跳过
    └→ 恢复失败 → 继续用同一故障
                  ↓
              方案二: 开飞行模式 → 等 3s → 关飞行模式 → 验证
                  ├→ 成功 → 记录(方案一 FAIL, 方案二 OK)
                  └→ 失败 → 记录(双双 FAIL)
```

- **恢复判定**：AP 数量恢复到基线 80% 以上
- **连接验证**：恢复后能否重新连接到已保存的热点
- **降级链**：方案一失败会自动触发方案二

## 快速开始

### 1. 环境准备

- **Python 3.8+** — [下载](https://www.python.org/downloads/)
- **ADB** — [下载 Platform Tools](https://developer.android.com/studio/releases/platform-tools)，解压后将目录加入系统 PATH
- **Android 设备** — USB 连接，开启「USB 调试」

```bash
# 验证环境
python --version     # Python 3.8+
adb devices          # 应显示设备且状态为 device
```

### 2. 一键启动 (Windows)

```
双击 run.bat
```

默认 50 轮测试，自动检测当前 WiFi。测试结束后报告自动输出到 `.\reports\`。

### 3. 命令行启动

```bash
# 默认：50 轮，自动检测 WiFi
python wifi_self_healing_test.py

# 指定测试轮数
python wifi_self_healing_test.py --cycles 100

# 手动指定 WiFi（跳过自动检测）
python wifi_self_healing_test.py --cycles 50 --ssid "MyWiFi" --password "12345678"

# 交互式配置（逐步引导）
python wifi_self_healing_test.py
```

## 命令行参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--cycles` | `50` | 重启测试次数 |
| `--boot-wait` | `15` | 开机后额外等待秒数（等 WiFi 初始化） |
| `--ssid` | (自动检测) | 目标 WiFi SSID，不填则自动检测当前连接 |
| `--password` | (自动读取) | 目标 WiFi 密码，不填则从设备自动读取已保存密码 |
| `--no-auto-detect` | 关闭 | 禁用自动检测，必须手动指定 --ssid 和 --password |
| `--output` | `./reports` | 报告输出目录 |
| `--settings-intent` | `android.settings.WIFI_SETTINGS` | uiautomator2 降级时的设置页 |

## 注入的故障类型

| 标识 | 说明 | 模拟场景 |
|------|------|----------|
| `wpa_kill` | SIGKILL 杀 wpa_supplicant | wpa_supplicant 崩溃，WiFi 彻底断开 |
| `wpa_freeze` | SIGSTOP 卡死 wpa_supplicant | 进程挂起，WiFi 按钮点按无反应 |
| `wificond_kill` | SIGKILL 杀 wificond | WiFi 守护进程崩溃 |

每轮随机选择一种故障注入。

## 恢复方案

| 方案 | 操作 | 等待 | 说明 |
|------|------|------|------|
| 方案一 | `svc wifi disable` → 等 3s → `svc wifi enable` | 关闭 3s / 打开 5s | 通过系统服务命令开关 WiFi |
| 方案二 | `settings put airplane_mode_on 1` → 等 3s → 设为 0 | 开启 3s / 关闭 8s | 飞行模式重置无线模块 |

方案一失败时自动降级到方案二。

## 报告输出

测试完成后在 `.\reports\` 生成 3 份报告：

| 文件 | 格式 | 内容 |
|------|------|------|
| `wifi_healing_<时间戳>.json` | JSON | 完整数据，含逐轮记录和汇总统计 |
| `wifi_healing_<时间戳>.html` | HTML | 可视化报告，含统计卡片和逐轮表格 |
| 终端输出 | 文本 | 实时打印汇总 + 逐轮明细表 |

### 逐轮明细表列说明

| 列 | 说明 |
|----|------|
| 轮次 | 第几轮测试 |
| 开始时间 | 本轮测试开始时间 |
| 开机完成 | Android boot_completed 的时间点 |
| WiFi就绪 | WiFi 服务可响应的时间点 |
| 初始化耗时 | 从 boot_completed 到 WiFi 就绪的秒数 |
| 列表为空 | WiFi 扫描列表是否为空 (Y/N) |
| 连接成功 | 能否连接到目标热点 (OK/FAIL/-) |
| 本轮成功 | 方案一或方案二任一恢复成功 (OK/FAIL) |
| 失败类型 | 重启失败 / 故障注入失败 / 双双失败 / - |
| 失败详情 | 具体失败原因 |
| 重启OK | 关机/重启命令是否成功 (OK/FAIL) |
| 日志路径 | 本轮详细日志目录 |

### 统计指标

- **方案一成功率**：仅开关 WiFi 即可恢复的轮次占比
- **降级次数**：方案一失败后触发方案二的次数
- **方案二救回率**：方案二成功恢复的占比（基于降级次数）
- **双双失败**：两种方案均无法恢复的次数
- **综合成功率**：最终恢复成功的总占比
- **PASS 阈值**：综合成功率 ≥ 95%

## 逐轮日志

每轮测试在 `.\reports\logs\run_<时间>\iteration_<N>\` 下保存 `record.json`，包含本轮全部状态数据。

## 常见问题

### Q: 提示 "未检测到已连接的设备"

```bash
# 检查连接
adb devices
# 应显示：790082604550001170    device

# 如果显示 unauthorized，在设备上点击「允许 USB 调试」
# 如果无设备，检查 USB 线和 USB 调试开关
```

### Q: 提示 "adb 未找到"

将 Android Platform Tools 目录加入系统 PATH，或把 `adb.exe` 放到脚本同目录。

### Q: 自动检测 WiFi 失败

```bash
# 手动指定
python wifi_self_healing_test.py --cycles 50 --ssid "MyWiFi" --password "12345678"
```

### Q: 测试过程被中断后设备卡住

```bash
# 手动恢复 WiFi
adb shell svc wifi enable
# 或者重启设备
adb reboot
```

### Q: 报告乱码

终端编码问题，查看 HTML 报告即可（推荐用浏览器打开）。

## 注意事项

1. **设备需要 root 权限**才能自动读取 WiFi 密码（`wpa_supplicant.conf`）
2. 无 root 时可用 `--ssid` 和 `--password` 手动指定
3. 测试期间设备会**反复重启**，确保设备不会因此进入 Recovery 模式
4. 建议使用**专用测试设备**，不要用日常手机
5. 每次测试前确保设备电量充足（建议 > 80%）
