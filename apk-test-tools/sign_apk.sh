#!/bin/bash
# ============================================================
# APK 测试工具 — 平台证书签名脚本 (v3.0)
#
# 用法：
#   1. 将 platform.pk8 和 platform.x509.pem 放入 keystore/ 目录
#   2. ./sign_apk.sh <unsigned.apk> [output.apk]
#
# 需求：
#   - signapk.jar（AOSP 编译产物，通常在 out/host/linux-x86/framework/）
#   - 或者使用 apksigner（Android SDK 自带）
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEYSTORE_DIR="$SCRIPT_DIR/keystore"
PLATFORM_KEY="$KEYSTORE_DIR/platform.pk8"
PLATFORM_CERT="$KEYSTORE_DIR/platform.x509.pem"

INPUT_APK="${1:-}"
OUTPUT_APK="${2:-${INPUT_APK%.apk}-signed.apk}"

if [ -z "$INPUT_APK" ]; then
    echo "用法: $0 <unsigned.apk> [output.apk]"
    echo ""
    echo "前置条件："
    echo "  将 platform.pk8 和 platform.x509.pem 放入 keystore/ 目录"
    echo ""
    echo "从 AOSP 获取签名材料："
    echo "  cp build/target/product/security/platform.pk8  keystore/"
    echo "  cp build/target/product/security/platform.x509.pem keystore/"
    exit 1
fi

if [ ! -f "$INPUT_APK" ]; then
    echo "错误: 未找到输入文件 $INPUT_APK"
    exit 1
fi

# ---- 方法 A：使用 signapk.jar（推荐，最可靠） ----
SIGNAPK_JAR="$SCRIPT_DIR/signapk.jar"
if [ -f "$SIGNAPK_JAR" ]; then
    if [ -f "$PLATFORM_KEY" ] && [ -f "$PLATFORM_CERT" ]; then
        echo "[方法A] 使用 signapk.jar 签名..."
        java -jar "$SIGNAPK_JAR" "$PLATFORM_CERT" "$PLATFORM_KEY" "$INPUT_APK" "$OUTPUT_APK"
        echo "签名完成: $OUTPUT_APK"
        echo ""
        echo "安装到系统分区："
        echo "  adb root && adb remount"
        echo "  adb push $OUTPUT_APK /system/priv-app/APKTestTools/APKTestTools.apk"
        echo "  adb reboot"
        exit 0
    fi
fi

# ---- 方法 B：使用 apksigner（需要先转换 key 格式） ----
echo "[方法B] 使用 apksigner 签名..."
echo "将 platform.pk8 + x509.pem 转换为 PKCS12 keystore..."

PLATFORM_PEM="$KEYSTORE_DIR/platform.pem"
PLATFORM_P12="$KEYSTORE_DIR/platform.p12"
PLATFORM_JKS="$KEYSTORE_DIR/platform.keystore"
KEYSTORE_PASS="android"

# DER → PEM (pk8 to pem)
openssl pkcs8 -in "$PLATFORM_KEY" -inform DER -outform PEM -out "$PLATFORM_PEM" -nocrypt

# PEM + CERT → PKCS12
openssl pkcs12 -export \
    -in "$PLATFORM_CERT" \
    -inkey "$PLATFORM_PEM" \
    -out "$PLATFORM_P12" \
    -password pass:"$KEYSTORE_PASS" \
    -name platform

# PKCS12 → JKS (apksigner 用)
keytool -importkeystore \
    -destkeystore "$PLATFORM_JKS" \
    -deststorepass "$KEYSTORE_PASS" \
    -srckeystore "$PLATFORM_P12" \
    -srcstoretype PKCS12 \
    -srcstorepass "$KEYSTORE_PASS" \
    -noprompt

# 用 apksigner 签名
apksigner sign \
    --ks "$PLATFORM_JKS" \
    --ks-pass pass:"$KEYSTORE_PASS" \
    --ks-key-alias platform \
    --out "$OUTPUT_APK" \
    "$INPUT_APK"

# 清理临时文件
rm -f "$PLATFORM_PEM" "$PLATFORM_P12" "$PLATFORM_JKS"

echo "签名完成: $OUTPUT_APK"
echo ""
echo "安装到系统分区："
echo "  adb root && adb remount"
echo "  adb push $OUTPUT_APK /system/priv-app/APKTestTools/APKTestTools.apk"
echo "  adb reboot"
