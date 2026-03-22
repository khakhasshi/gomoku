# 易诗雨和江景哲专属五子棋对战服务

一个为易诗雨和江景哲定制的双人实时联机五子棋服务，默认监听 `0.0.0.0:7004`。

## 功能

- 创建房间
- 加入房间
- 15 × 15 棋盘实时同步
- 江景哲使用藏青色棋子先手
- 易诗雨使用粉色棋子后手
- 五子连珠自动判胜
- 平局判定
- 离开房间
- 双方确认后再来一局

## 玩法规范

- 棋盘大小为 15 × 15。
- 江景哲固定使用藏青色棋子先手。
- 易诗雨固定使用粉色棋子后手。
- 双方轮流在空位落子。
- 任意方向（横、竖、斜）先连成 5 子者获胜。
- 棋盘下满且无人达成 5 子时判定为平局。
- 任一玩家离开房间后，对局会重置并等待新玩家加入。

## 启动方式

```bash
npm install --cache .npm-cache
npm start
```

如需自定义监听地址或端口：

```bash
HOST=0.0.0.0 PORT=7005 npm start
```

启动后访问：

- http://localhost:7004
- http://你的局域网IP:7004

## 项目结构

- `server.js`：Express + WebSocket 服务端与房间/对战逻辑
- `public/index.html`：主页面结构
- `public/styles.css`：界面样式
- `public/app.js`：前端交互与实时通信
- `deploy-ubuntu-nginx.sh`：Ubuntu 下一键部署到公网 `7004` 的脚本

## Ubuntu 一键部署

在 Ubuntu 服务器项目目录下执行：

```bash
chmod +x deploy-ubuntu-nginx.sh
sudo ./deploy-ubuntu-nginx.sh
```

脚本会自动：

- 安装 Node.js、npm、nginx
- 执行 `npm install`
- 生成 `systemd` 服务运行本项目
- 优先让应用在 `127.0.0.1:7005` 运行，若被占用则自动选择空闲内部端口
- 让 nginx 对公网监听 `7004` 并转发 WebSocket/HTTP 流量
