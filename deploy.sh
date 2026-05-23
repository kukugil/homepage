#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo "========================================="
echo "  E-Reader 腾讯云自动部署脚本"
echo "========================================="
echo ""

# ---------- 1. 系统更新 ----------
echo "[1/6] 更新系统..."
apt update && apt upgrade -y && log "系统更新完成"

# ---------- 2. 安装 Node.js 20 + git + nginx ----------
echo "[2/6] 安装 Node.js 20 / git / nginx..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs && log "Node.js $(node -v) 安装完成"
else
  log "Node.js $(node -v) 已安装"
fi

apt install -y git nginx && log "git + nginx 安装完成"

# ---------- 3. 安装 PM2 ----------
echo "[3/6] 安装 PM2..."
npm install -g pm2 && log "PM2 安装完成"

# ---------- 4. 克隆项目 ----------
echo "[4/6] 克隆项目..."
rm -rf /opt/ereader

# 尝试多个源
if git clone https://github.com/kukugil/homepage.git /opt/ereader 2>/dev/null; then
  log "GitHub 直连克隆成功"
elif git clone https://ghproxy.net/https://github.com/kukugil/homepage.git /opt/ereader 2>/dev/null; then
  log "ghproxy 镜像克隆成功"
elif git clone https://gitclone.com/github.com/kukugil/homepage.git /opt/ereader 2>/dev/null; then
  log "gitclone 镜像克隆成功"
else
  err "克隆失败，请手动上传代码到 /opt/ereader"
fi

# ---------- 5. 安装依赖 ----------
echo "[5/6] 安装项目依赖..."
cd /opt/ereader/plan-a
npm install --production && log "npm 依赖安装完成"

# ---------- 6. 启动服务 ----------
echo "[6/6] 启动服务..."
pm2 delete ereader 2>/dev/null || true
pm2 start server/index.js --name ereader --cwd /opt/ereader/plan-a
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
log "PM2 服务已启动"

# ---------- 验证 ----------
sleep 2
if curl -s http://localhost:3001/health | grep -q ok; then
  log "部署成功！访问 http://$(curl -s ifconfig.me):3001/health"
else
  err "服务未正常启动，请运行: pm2 logs ereader"
fi
