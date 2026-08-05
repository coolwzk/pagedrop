# PageDrop

把页面拖进来，链接马上就绪。

无需构建命令，也无需配置服务器。提交 **HTML**、**Markdown** 或完整 **ZIP** 静态站点，即刻生成可分享的访问地址。适合内网分享原型、说明文档、临时页面。

![PageDrop](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

## 功能

| 能力 | 说明 |
|------|------|
| 拖拽上传 | HTML / Markdown / ZIP |
| 用户名归类 | 仅用于命名空间与查找，不是登录账号 |
| 自动检查 | ZIP 安全解压（Zip Slip 防护）、入口 `index.html`、扩展名白名单 |
| Markdown | 自动渲染为带样式的 HTML 页面 |
| 即时链接 | `/p/{username}/{id}/` 静态访问 |
| 最近发布 | 按用户名查看已发布页面 |

## 快速开始

```bash
# 需要 Node.js >= 18
cd pagedrop
npm install
npm start
```

浏览器打开：http://localhost:3780

```bash
npm test    # 运行测试
npm run dev # 开发模式（文件变更自动重启）
```

## 使用方式

1. 填写**用户名**（例如 `zhangsan`）
2. 拖入 `.html` / `.md` / `.zip` 文件
3. 系统校验后生成链接，并自动在新窗口打开

### ZIP 要求

- 根目录包含 `index.html`，或 ZIP 内仅有一层子目录且其中包含 `index.html`（会自动提升）
- 仅允许静态资源扩展名：html/css/js/图片/字体等
- 默认体积上限 20MB（可用环境变量调整）

## 分享链接说明

复制出的链接默认会尽量使用**局域网 IP**（而不是 `localhost`），方便同事访问：

```text
http://192.168.x.x:3780/p/zekai/xxxxx/
```

- 同事需与你在同一局域网（或 VPN）
- 本机防火墙需放行 `3780` 端口
- PageDrop 服务需保持运行

也可固定对外地址：

```powershell
# PowerShell
$env:PUBLIC_URL="http://192.168.1.23:3780"
npm start
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3780` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PUBLIC_URL` / `BASE_URL` | （自动检测局域网 IP） | 分享链接的根地址，如 `http://192.168.1.23:3780` |
| `MAX_FILE_BYTES` | `20971520` | 上传体积上限（字节） |

## 项目结构

```text
pagedrop/
├── public/           # 前端（上传页 UI）
├── server/
│   ├── index.js      # Express 入口
│   ├── config.js
│   ├── routes/api.js
│   └── lib/          # 发布、ZIP、Markdown、元数据
├── storage/sites/    # 已发布站点文件（运行时生成）
├── data/pages.json   # 页面元数据（运行时生成）
└── tests/
```

## API

### `POST /api/publish`

`multipart/form-data`：

- `username` — 用户名
- `file` — HTML / MD / ZIP 文件

成功响应：

```json
{
  "ok": true,
  "page": { "id": "...", "username": "zhangsan", "title": "...", "kind": "html" },
  "path": "/p/zhangsan/xxxx/",
  "url": "http://localhost:3780/p/zhangsan/xxxx/"
}
```

### `GET /api/pages?username=zhangsan`

列出该用户（或全体最近）已发布页面。

### 静态访问

```text
GET /p/:username/:id/
```

## 安全说明

- **Zip Slip**：解压路径强制限制在站点目录内
- **扩展名白名单**：拒绝 `.exe` 等可执行类型
- **体积与条目数限制**：防止 zip bomb
- 本工具面向**内网信任环境**；任意 HTML/JS 会按用户上传内容执行，请勿对公网匿名开放而不加鉴权与审计

## License

MIT
