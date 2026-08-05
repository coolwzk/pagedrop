# PageDrop

把页面拖进来，链接马上就绪。

无需构建命令，也无需配置服务器。提交 **HTML**、**Markdown** 或完整 **ZIP** 静态站点，即刻生成可分享的访问地址。适合内网分享原型、说明文档、临时页面。

![PageDrop](https://img.shields.io/badge/node-%3E%3D18-brightgreen) ![license](https://img.shields.io/badge/license-MIT-blue)

设计说明见 [docs/DESIGN-auth-ttl-docker.md](./docs/DESIGN-auth-ttl-docker.md)。

## 功能

| 能力 | 说明 |
|------|------|
| 拖拽上传 | HTML / Markdown / ZIP |
| 登录鉴权 | 默认开启；发布/管理需登录，`/p/*` 分享链接仍可匿名打开 |
| 有效期 | 永久 / 1 / 7 / 30 / 90 / 365 天，到期自动清理 |
| 删除 | 所有者或管理员删除页面与磁盘文件 |
| 自动检查 | ZIP Slip 防护、入口 `index.html`、扩展名白名单 |
| Markdown | 自动渲染为带样式的 HTML |
| 即时链接 | `/p/{username}/{id}/` |
| Docker | `docker compose up` 一键部署 |

## 快速开始（本地）

```bash
cd pagedrop
npm install

# 可选：自定义管理员密码
# Windows PowerShell:
#   $env:ADMIN_PASSWORD="your-strong-password"
#   $env:SESSION_SECRET="long-random-secret"
#   $env:AUTH_ENABLED="true"

npm start
```

浏览器打开：http://localhost:3780

### 默认账号（首次启动，登录页不展示）

| 项目 | 值 |
|------|-----|
| 用户名 | `admin` |
| 密码 | `admin123` |

- 未设置 `ADMIN_PASSWORD` 时自动创建上述管理员（**不会**显示在登录页）。
- 启动控制台与 `data/INITIAL_CREDENTIALS.txt` 可查看；登录后建议修改密码。
- 生产环境请设置 `ADMIN_PASSWORD` / `SESSION_SECRET`。

### 注册账号

1. 打开 `http://服务器IP:3780/`
2. 点击 **注册账号**
3. 填写用户名（字母/数字/`_`/`-`）与密码（≥6 位）
4. 注册成功后自动登录，即可发布页面

关闭自助注册：

```powershell
$env:AUTH_ALLOW_REGISTER="false"
npm start
```

忘记管理员密码可重置：

```bash
npm run reset-admin
# 或指定新密码
npm run reset-admin -- YourNewPassword
```

```bash
npm test    # 测试
npm run dev # 开发热重载
```

关闭鉴权（纯内网信任模式，兼容旧用法）：

```powershell
$env:AUTH_ENABLED="false"
npm start
```

## Docker 一键部署

```bash
cp .env.example .env
# 编辑 .env：设置 ADMIN_PASSWORD、SESSION_SECRET、PUBLIC_URL

docker compose up -d --build
# 或: npm run docker:up
```

访问 `http://服务器IP:3780`，使用 `.env` 中的管理员账号登录。

数据持久化卷：

- `pagedrop-data` → `/app/data`（用户与页面元数据）
- `pagedrop-storage` → `/app/storage`（静态文件）

```bash
docker compose logs -f
docker compose down
```

## 使用方式

1. **登录**（鉴权开启时）
2. 选择**有效期**，拖入 `.html` / `.md` / `.zip`
3. 复制分享链接发给同事（无需登录即可打开）
4. 在「最近发布」中可**删除**自己的页面

### ZIP 要求

- 根目录（或单层子目录）包含 `index.html`
- 仅允许静态资源扩展名
- 默认体积上限 20MB

## 分享链接

优先使用局域网 IP（或 `PUBLIC_URL`），例如：

```text
http://192.168.x.x:3780/p/zekai/xxxxx/
```

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3780` | 端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `PUBLIC_URL` | 自动检测局域网 IP | 分享链接根地址 |
| `AUTH_ENABLED` | `true` | 是否开启登录 |
| `AUTH_ALLOW_REGISTER` | `true` | 是否开放自助注册（登录页「注册账号」） |
| `ADMIN_USERNAME` | `admin` | 引导管理员用户名 |
| `ADMIN_PASSWORD` | （随机生成） | 引导管理员密码 |
| `SESSION_SECRET` | （进程内随机） | Cookie 签名密钥，生产必设 |
| `SESSION_TTL_SECONDS` | `604800` | 会话有效期（默认 7 天） |
| `COOKIE_SECURE` | `false` | HTTPS 时设 `true` |
| `DEFAULT_TTL_DAYS` | `30` | 默认页面有效期（0=永久） |
| `CLEANUP_INTERVAL_MS` | `900000` | 过期扫描间隔（默认 15 分钟） |
| `MAX_FILE_BYTES` | `20971520` | 上传体积上限 |

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/config` | 鉴权/TTL 配置 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 退出 |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/publish` | 发布（需登录） |
| GET | `/api/pages` | 列表（需登录） |
| DELETE | `/api/pages/:user/:id` | 删除（owner/admin） |
| GET | `/p/:user/:id/` | 静态访问（公开，过期 410） |

## 项目结构

```text
pagedrop/
├── public/              # 前端
├── server/
│   ├── index.js
│   ├── config.js
│   ├── middleware/auth.js
│   ├── routes/{api,auth}.js
│   └── lib/             # auth、session、publish、cleanup…
├── docs/                # 设计文档
├── Dockerfile
├── docker-compose.yml
├── storage/sites/
├── data/
└── tests/
```

## 安全说明

- 发布与管理受登录保护；分享链接默认公开可读
- 密码 bcrypt 哈希；会话 HMAC 签名 Cookie
- 登录接口进程内限速
- ZIP Slip / 扩展名 / 体积限制
- 上传的 HTML/JS 会在浏览器执行——面向内网；公网请配合网关鉴权与审计

## License

MIT
