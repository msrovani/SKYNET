#!/bin/bash
# SKYNET DePIN Node — Unix One-Liner Installer
# Usage: curl -fsSL https://get.skynet.network | sh
# Or:    ./install.sh [--portable] [--service] [--path /opt/skynet]

set -euo pipefail

REPO="https://github.com/skynet-depin/desktop-node-agent/releases/latest/download"
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GRAY='\033[2m'; NC='\033[0m'
step() { echo -e "${CYAN}==>${NC} $1"; }
ok()   { echo -e "  ${GREEN}OK${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

PORTABLE=false
SERVICE=false
INSTALL_PATH="/opt/skynet"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --portable) PORTABLE=true; shift ;;
    --service) SERVICE=true; shift ;;
    --path) INSTALL_PATH="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

# Detect OS + arch
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) warn "Unsure arch: $ARCH — assuming x64"; ARCH="x64" ;;
esac
case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="macos" ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

step "SKYNET DePIN Node Installer v0.1.0"
step "Platform: $OS $ARCH"

# GPU detection
if command -v nvidia-smi &>/dev/null; then
  GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | head -5)
  GPU_COUNT=$(echo "$GPU_INFO" | wc -l)
  VRAM=$(echo "$GPU_INFO" | awk -F', ' '{sum += $2} END {print sum}' | grep -oP '\d+' || echo "0")
  echo "  GPU(s): $GPU_COUNT × NVIDIA ($(echo "$GPU_INFO" | head -1 | cut -d, -f1))"
  echo "  Backend: CUDA"
elif command -v rocm-smi &>/dev/null; then
  echo "  GPU(s): AMD ROCm detected"
  echo "  Backend: ROCm"
elif [[ "$OS" == "macos" ]]; then
  echo "  GPU(s): Apple Silicon / Metal"
  echo "  Backend: Metal"
else
  echo "  GPU(s): None detected (CPU mode)"
  echo "  Backend: Vulkan (CPU fallback)"
fi

if $PORTABLE; then
  step "Portable mode"
  TARGET="./SKYNET_PORTABLE"
  mkdir -p "$TARGET"
  URL="$REPO/skynet-node-$OS-$ARCH-portable.tar.gz"
  curl -fsSL "$URL" | tar xz -C "$TARGET"
  EXE="$TARGET/skynet-node"
  ok "Installed at $TARGET"
else
  step "Installing to $INSTALL_PATH"
  sudo mkdir -p "$INSTALL_PATH"
  URL="$REPO/skynet-node-$OS-$ARCH.tar.gz"
  curl -fsSL "$URL" | sudo tar xz -C "$INSTALL_PATH"
  EXE="$INSTALL_PATH/skynet-node"
  sudo chmod +x "$EXE"
  ok "Installed: $EXE"
fi

$SERVICE && ! $PORTABLE && {
  step "Installing system service..."
  sudo "$EXE" install-service 2>/dev/null
  ok "Service installed"
}

! $PORTABLE && {
  step "Enabling autorun..."
  "$EXE" enable-autorun 2>/dev/null
  ok "Autorun enabled"
}

# Firewall (Linux)
[[ "$OS" == "linux" ]] && command -v ufw &>/dev/null && {
  step "Configuring firewall..."
  sudo ufw allow 443/udp comment 'SKYNET WebTransport' 2>/dev/null || true
  sudo ufw allow proto udp from any to any port 49152:65535 comment 'SKYNET WebRTC' 2>/dev/null || true
  ok "Firewall rules created"
}

step "Starting SKYNET Node..."
nohup "$EXE" >/dev/null 2>&1 &
ok "Node started! Check tray icon."

echo ""
echo -e "${GREEN}SKYNET DePIN Node installed successfully!${NC}"
echo -e "  ${GRAY}Path:    $([ "$PORTABLE" = true ] && echo "$TARGET" || echo "$INSTALL_PATH")${NC}"
echo -e "  ${GRAY}Service: $([ "$SERVICE" = true ] && echo "Yes" || echo "No")${NC}"
echo -e "  ${GRAY}Autorun: $([ "$PORTABLE" = true ] && echo "No (portable)" || echo "Yes")${NC}"
