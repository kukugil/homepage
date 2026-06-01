# WiFi 异常自愈能力测试

验证 Android 设备在 WiFi 异常情况下，通过「开关 WiFi」或「飞行模式切换」能否自动恢复，无需重启设备。

## 测试原理

```
┌─ 环境检查（Python / ADB / 设备连接）
├─ 采集基线（AP 数量、连接状态）
├─ 注入随机故障（杀 wpa_supplicant / 卡死 wpa_supplicant / 杀 wificond）
├─ 方案一：关闭 WiFi → 等 3s → 打开 WiFi → 验证
│   └─ 降级链模式：方案一成功 → 跳过方案二
│      全测模式：   无论成败 → 重新注入故障 → 方案二
└─ 方案二：开飞行模式 → 等 3s → 关飞行模式 → 验证
```

- **恢复判定**：AP 数量恢复到基线 80% 以上
- **连接验证**：恢复后能否重新连接到已保存的热点（支持自动回连，无需密码）
- **降级链**：方案一失败自动触发方案二（默认模式）

## 快速开始

### 1. 环境准备

- **Python 3.8+** — [下载](https://www.python.org/downloads/)
- **ADB** — [下载 Platform Tools](https://developer.android.com/studio/releases/platform-tools)，解压后加入系统 PATH
- **Android 设备** — USB 连接，开启「USB 调试」

```bash
python --version     # Python 3.8+
adb devices          # 应显示设备且状态为 device
```

### 2. 一键启动

```
双击 run.bat
```

自动完成环境检查 → 交互式配置参数 → 启动测试。测试结束后报告输出到 `.\reports\`。

### 3. 命令行启动

```bash
# 交互式配置（环境检查 + 逐项配置）
python wifi_self_healing_test.py

# 跳过交互，直接指定轮数（自动检测 WiFi）
python wifi_self_healing_test.py --cycles 100

# 手动指定 WiFi
python wifi_self_healing_test.py --cycles 50 --ssid "MyWiFi" --password "12345678"

# 全测模式（方案一和方案二都测）
python wifi_self_healing_test.py --cycles 50 --recovery-mode both
```

## 命令行参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--cycles` | `50` | 重启测试次数 |
| `--boot-wait` | `15` | 开机后额外等待秒数（等 WiFi 初始化） |
| `--ssid` | 自动检测 | 目标 WiFi SSID，不填则自动检测当前连接 |
| `--password` | 自动读取 | WiFi 密码，不填则从设备自动读取；读取失败则依赖自动回连 |
| `--no-auto-detect` | 关闭 | 禁用自动检测，必须手动指定 `--ssid` 和 `--password` |
| `--recovery-mode` | `degrade` | 恢复策略：`degrade`（降级链）/ `both`（全测） |
| `--output` | `./reports` | 报告输出目录 |
| `--settings-intent` | `android.settings.WIFI_SETTINGS` | uiautomator2 降级时的设置页 |

## 恢复策略

启动时交互式选择（Y/N）：

```
  --- 恢复策略 ---
  降级链: 方案一失败后才测方案二
  全测:   方案一和方案二都测（同一故障）
  方案一和方案二都测？[y/N]:
```

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| **降级链**（默认，N） | 故障 → 方案一 → 仅失败时走方案二 | 验证降级链是否有效 |
| **全测**（Y） | 故障 → 方案一 → 重新注入同一故障 → 方案二 | 对比两种方案对同一故障的恢复能力 |

## 自动检测 WiFi 凭据

脚本会自动获取 WiFi 信息，**无需手动输入**：

| 步骤 | 方式 | 需要 root |
|------|------|-----------|
| 检测当前 SSID | `dumpsys wifi` / `cmd wifi status` / `dumpsys netstats` | 否 |
| 读取已保存密码 | `/data/misc/wifi/wpa_supplicant.conf` / `WifiConfigStore.xml` 等 4 条路径 | **是** |
| 连接验证（无密码时） | 利用 Android 自动回连已保存网络，等待后检查连接状态 | 否 |

> **无 root 设备**：SSID 仍可自动检测，密码无法读取但连接验证不会跳过——脚本会利用 Android 自动回连机制，WiFi 开启后自动连接已保存的网络，无需密码即可验证。

## 注入的故障类型

| 标识 | 说明 | 模拟场景 |
|------|------|----------|
| `wpa_kill` | SIGKILL 杀 wpa_supplicant | wpa_supplicant 崩溃，WiFi 彻底断开 |
| `wpa_freeze` | SIGSTOP 卡死 wpa_supplicant | 进程挂起，WiFi 按钮点按无反应 |
| `wificond_kill` | SIGKILL 杀 wificond | WiFi 守护进程崩溃 |

每轮随机选择一种。

## 恢复方案

| 方案 | 操作 | 等待 | 说明 |
|------|------|------|------|
| 方案一 | `svc wifi disable` → 等 3s → `svc wifi enable` | 关 3s / 开 5s | 系统服务命令开关 WiFi |
| 方案二 | 开飞行模式 → 等 3s → 关飞行模式 | 开 3s / 关 8s | 飞行模式重置无线模块 |

## 报告输出

测试完成后在 `.\reports\` 生成 **4 份报告**：

| 文件 | 格式 | 内容 |
|------|------|------|
| `wifi_healing_*.xlsx` | **Excel** | 汇总 Sheet + 逐轮明细 Sheet，带筛选和冻结首行 |
| `wifi_healing_*.json` | JSON | 完整数据，含逐轮记录和汇总统计 |
| `wifi_healing_*.html` | HTML | 可视化报告，含统计卡片和逐轮表格 |
| 终端输出 | 文本 | 实时打印汇总 + 逐轮明细表 |

### Excel 报告结构

- **汇总 Sheet**：测试概况、方案统计、降级链/全测统计、PASS/FAIL 结论
- **逐轮明细 Sheet**：12 列完整数据，自动筛选、冻结首行、失败行标红

### 逐轮明细表列说明

| 列 | 说明 |
|----|------|
| 轮次 | 第几轮测试 |
| 开始时间 | 本轮测试开始时间 |
| 开机完成 | Android boot_completed 的时间点 |
| WiFi就绪 | WiFi 服务可响应的时间点 |
| 初始化耗时 | boot_completed 到 WiFi 就绪的秒数 |
| 列表为空 | WiFi 扫描列表是否为空 (Y/N) |
| 连接成功 | 能否连接到目标热点 (OK/FAIL/-) |
| 本轮成功 | 方案一或方案二任一恢复成功 (OK/FAIL) |
| 失败类型 | 重启失败 / 故障注入失败 / 双双失败 |
| 失败详情 | 具体失败原因 |
| 重启OK | 关机/重启命令是否成功 (OK/FAIL) |
| 日志路径 | 本轮详细日志目录 |

### 统计指标

- **方案一成功率**：仅开关 WiFi 即可恢复的轮次占比
- **降级次数**：方案一失败后触发方案二的次数
- **方案二救回率**：方案二成功恢复的占比
- **双双失败**：两种方案均无法恢复的次数
- **综合成功率**：最终恢复成功的总占比
- **PASS 阈值**：综合成功率 ≥ 95%

## 逐轮日志

每轮测试在 `.\reports\logs\run_<时间>\iteration_<N>\` 下保存 `record.json`，包含本轮全部状态数据。

## 常见问题

### Q: 双击 run.bat 无反应

```bash
# 手动启动
python wifi_self_healing_test.py
```

### Q: 提示 "未检测到已连接的设备"

```bash
adb devices
# 应显示：790082604550001170    device
# unauthorized → 在设备上点击「允许 USB 调试」
# 无设备 → 检查 USB 线和 USB 调试开关
```

### Q: 自动获取密码失败（"无法自动读取密码"）

正常现象，脚本会自动切换为**依赖自动回连**模式——WiFi 开启后 Android 会自动连接已保存的网络，连接验证不会跳过。

### Q: 手动指定 WiFi

```bash
python wifi_self_healing_test.py --cycles 50 --ssid "MyWiFi" --password "12345678"
```

### Q: 测试中断后设备卡住

```bash
adb shell svc wifi enable    # 手动恢复 WiFi
adb reboot                   # 或重启设备
```

### Q: 报告乱码

终端编码问题，查看 HTML 或 Excel 报告即可。

## 注意事项

1. 测试期间设备会**反复重启**，使用专用测试设备
2. 确保设备电量充足（建议 > 80%）
3. 确保设备不会在反复重启后进入 Recovery 模式
4. 自动读取密码需要 root 权限，无 root 时依赖自动回连验证
5. Excel 报告需要 `openpyxl` 库（双击 run.bat 会自动安装）
