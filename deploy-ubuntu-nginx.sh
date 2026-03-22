#!/usr/bin/env bash
set -euo pipefail

APP_NAME="gomoku-online"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${SUDO_USER:-$USER}"
PUBLIC_PORT="7004"
APP_PORT="7005"
SYSTEMD_SERVICE="${APP_NAME}.service"
NGINX_SITE="${APP_NAME}.conf"
NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"

if [[ "$EUID" -ne 0 ]]; then
  echo "请使用 sudo 运行：sudo ./deploy-ubuntu-nginx.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y curl ca-certificates gnupg nginx

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_BIN="$(command -v node)"
NPM_BIN="$(command -v npm)"

cd "$PROJECT_DIR"

if [[ ! -f package.json ]]; then
  echo "未找到 package.json，请确认脚本位于项目根目录。"
  exit 1
fi

sudo -u "$APP_USER" "$NPM_BIN" install --cache "$PROJECT_DIR/.npm-cache"

mkdir -p /etc/gomoku-online
cat >/etc/gomoku-online/env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=${APP_PORT}
EOF

cat >/etc/systemd/system/${SYSTEMD_SERVICE} <<EOF
[Unit]
Description=Gomoku Online Node Service
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=/etc/gomoku-online/env
ExecStart=${NODE_BIN} ${PROJECT_DIR}/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/nginx/sites-available/${NGINX_SITE} <<EOF
server {
    listen ${PUBLIC_PORT};
    listen [::]:${PUBLIC_PORT};
    server_name _;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${NGINX_SITE} /etc/nginx/sites-enabled/${NGINX_SITE}
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable ${SYSTEMD_SERVICE}
systemctl restart ${SYSTEMD_SERVICE}
systemctl enable nginx
systemctl restart nginx

if command -v ufw >/dev/null 2>&1; then
  ufw allow ${PUBLIC_PORT}/tcp || true
fi

echo "部署完成。"
echo "公网访问端口：${PUBLIC_PORT}"
echo "应用内部端口：${APP_PORT}"
echo "检查服务状态：systemctl status ${SYSTEMD_SERVICE} --no-pager"
echo "检查 nginx 状态：systemctl status nginx --no-pager"
