# 物纪 · Chronicle — Docker 部署

## 1. 要求

- Docker Engine 24+
- Docker Compose v2
- `amd64` 或 `arm64` Linux 主机
- 建议至少 1 GB 可用内存

首版面向局域网、Tailscale 或其他 VPN。即使不直接暴露公网，仍默认启用管理员登录。

## 2. 首次启动

```bash
cp .env.example .env
```

编辑 `.env`，至少替换：

```dotenv
POSTGRES_PASSWORD=使用足够长的随机密码
CHRONICLE_PORT=3000
COOKIE_SECURE=false
```

启动：

```bash
docker compose up -d --build
```

查看状态：

```bash
docker compose ps
docker compose logs -f app worker
```

打开 `http://服务器地址:3000`，首次访问会进入一次性初始化向导。

## 3. 容器

- `postgres`：权威业务数据库。
- `migrate`：每次启动前执行幂等数据库迁移，成功后退出。
- `app`：API、登录与 React 静态资源。
- `worker`：后台任务进程（提醒展开、投递与重试）。

API 契约：

- 交互文档：`http://服务器地址:3000/api/docs`
- 机器可读 OpenAPI：`http://服务器地址:3000/api/v1/openapi.json`

持久卷：

- `chronicle_postgres-data`
- `chronicle_attachments`
- `chronicle_exports`

不要使用 `docker compose down -v` 管理正式实例；`-v` 会删除全部持久卷。

附件默认单文件上限为 20 MiB、每件物品最多 50 个，可在 `.env` 调整：

```dotenv
ATTACHMENT_MAX_BYTES=20971520
ATTACHMENT_MAX_COUNT_PER_ASSET=50
```

支持 JPEG、PNG、WebP、GIF 与 PDF。应用会根据文件签名而非浏览器声明判断类型，并为图片生成 WebP 缩略图。不要把附件卷作为静态目录暴露给反向代理。

## 4. HTTPS 与 Cookie

纯局域网 HTTP：

```dotenv
COOKIE_SECURE=false
```

通过 Caddy、Nginx 或 Traefik 提供 HTTPS 时：

```dotenv
COOKIE_SECURE=true
APP_ORIGIN=https://chronicle.example.com
```

将环境变量加入 `compose.yaml` 的应用环境后重启。反向代理只需转发到 `app:3000`，不应直接暴露 PostgreSQL、附件卷或 Docker Socket。

## 5. 健康检查

- 存活：`GET /health/live`
- 就绪：`GET /health/ready`

就绪检查会验证 PostgreSQL 连接。Compose 只有在迁移成功后才启动 App 与 Worker。

## 6. 管理员密码重置

在 `.env` 与数据卷完整的项目目录执行：

```bash
CHRONICLE_NEW_PASSWORD='新的长密码' \
  docker compose run --rm app node api/dist/cli/reset-password.js
```

命令成功后，所有既有登录会话都会失效。不要把真实密码提交到 shell 脚本或 Git。

## 7. 手工备份

第一版不内置自动备份。管理员可在“数据与备份”下载 `Chronicle Export v1` 可移植 ZIP，并在预览冲突后以 replace 模式导入恢复。归档包含 JSON、CSV、附件和 SHA-256 清单，但不含管理员密码与通知密钥。应用内导入适合迁移与核验；底层灾难恢复仍必须至少备份 PostgreSQL 和附件卷。

只备份其中一项不是完整备份。为避免上传恰好发生在两个备份步骤之间，先短暂停止写入进程：

```bash
docker compose stop app worker
```

备份完成后执行 `docker compose start app worker`。

### 7.1 导出 PostgreSQL

```bash
docker compose exec -T postgres \
  pg_dump -U chronicle -d chronicle -Fc > chronicle-db.dump
```

### 7.2 导出附件卷

```bash
docker run --rm \
  -v chronicle_attachments:/source:ro \
  -v "$PWD":/backup \
  alpine tar -czf /backup/chronicle-attachments.tar.gz -C /source .
```

附件元数据位于 PostgreSQL，原始文件与缩略图位于附件卷，两者必须作为同一备份集保存。应用内便携 ZIP 适合手工迁移和核验，不能替代这一卷级恢复链路。

### 7.3 恢复前检查

- 记录产生备份时的物纪版本。
- 对备份文件计算 SHA-256。
- 在独立测试实例验证恢复。
- 不要在运行中的正式数据卷上直接试恢复。

## 8. 升级

当前开发阶段从源码构建：

```bash
git pull
docker compose build
docker compose up -d
```

`migrate` 服务会先执行数据库迁移。升级前必须手工备份；如果迁移失败，App 与 Worker 不会启动。

正式发布后应使用明确语义化版本标签，不建议持续跟随 `latest`。

## 9. 停止与排障

停止但保留数据：

```bash
docker compose down
```

查看迁移：

```bash
docker compose logs migrate
```

查看应用健康：

```bash
curl -fsS http://127.0.0.1:3000/health/ready
```

常见问题：

- 初始化页无法保存：检查 `postgres` 和 `migrate` 日志。
- 登录后仍回到登录页：检查 HTTP 部署是否误设 `COOKIE_SECURE=true`。
- 反向代理写请求返回 403：检查 `APP_ORIGIN` 是否与浏览器地址完全一致。
