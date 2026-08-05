# PageDrop 设计：鉴权 · 删除/过期 · Docker

## 1. 目标

| 能力 | 目标 |
|------|------|
| 登录鉴权 | 发布/管理需登录；已发布静态页仍可匿名访问（便于分享） |
| 删除 | 所有者或管理员可删除页面及磁盘文件 |
| 过期清理 | 发布时可选 TTL；定时扫描删除过期页 |
| Docker | 一键 `docker compose up` 部署，数据卷持久化 |

## 2. 鉴权模型

```
┌─────────────┐     cookie session      ┌──────────────┐
│  浏览器 UI  │ ──────────────────────► │  API 层      │
└─────────────┘   HttpOnly + Signed     │ requireAuth  │
                                        └──────┬───────┘
                                               │
                     ┌─────────────────────────┼────────────────┐
                     ▼                         ▼                ▼
              POST /publish            DELETE /pages      GET /pages
              (登录用户命名空间)        (owner|admin)      (自己的 / admin 全部)
```

### 2.1 规则

- **AUTH_ENABLED=true**（默认）：发布、列表、删除需登录；`/p/*` 静态访问公开。
- **AUTH_ENABLED=false**：兼容旧行为，自由填写用户名发布（内网信任场景）。
- 角色：`user` | `admin`。
- 开启鉴权后，页面 `username` **强制等于登录用户**，防止冒名发布。
- Session：HMAC-SHA256 签名 Cookie（`pd_session`），不落服务端 Session 存储，便于多副本（无状态）。
- 密码：`bcryptjs` 哈希，存 `data/users.json`。
- 启动时若不存在用户，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 引导创建管理员。

### 2.2 API

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/auth/config` | 无 | 是否开启鉴权、是否允许注册 |
| POST | `/api/auth/login` | 无 | `{username,password}` → Set-Cookie |
| POST | `/api/auth/logout` | 可选 | 清 Cookie |
| GET | `/api/auth/me` | 可选 | 当前用户 |
| POST | `/api/auth/register` | 条件 | `AUTH_ALLOW_REGISTER=true` 时开放 |
| POST | `/api/auth/users` | admin | 管理员创建用户 |

## 3. 删除与过期

### 3.1 数据字段

```json
{
  "id": "...",
  "username": "zekai",
  "owner": "zekai",
  "expiresAt": "2026-09-05T00:00:00.000Z",
  "ttlDays": 30,
  "createdAt": "..."
}
```

- `expiresAt=null`：永不过期。
- `ttlDays`：0 或空表示永久；1/7/30/90 等。

### 3.2 删除

- `DELETE /api/pages/:username/:id`
- 权限：`owner === me` 或 `role === admin`
- 原子性：先删元数据再删目录（或反之：先目录后元数据；失败可重试 cleanup）

### 3.3 清理

- 定时任务：`CLEANUP_INTERVAL_MS`（默认 15min）扫描 `expiresAt < now` 并删除。
- 请求时过滤：列表不返回过期项；访问过期 `/p/:user/:id` 返回 **410 Gone**。
- 启动时跑一次 cleanup。
- 删除顺序：先删磁盘目录（路径校验后），再删元数据，避免元数据丢失导致无法对账。

## 4. Docker

```
docker compose up -d
```

- 镜像：`node:22-alpine`
- 卷：`pagedrop-data` → `/app/data`，`pagedrop-storage` → `/app/storage`
- 环境：`ADMIN_PASSWORD`、`SESSION_SECRET`、`PUBLIC_URL`、`DEFAULT_TTL_DAYS`
- 健康检查：`GET /api/health`

## 5. 安全要点

- Cookie：`HttpOnly; SameSite=Lax; Path=/`；生产可加 `Secure`（`COOKIE_SECURE=true`）
- 强制改默认密码提示（admin 初始密码过短则拒绝启动）
- 静态页仍可托管任意 JS——内网信任前提；鉴权只保护「谁能发布」
- 登录限速：简单内存滑动窗口（防爆破）

## 6. 兼容

- 旧页面无 `owner`/`expiresAt`：列表与删除时 `owner` 回退为 `username`；无过期视为永久。
