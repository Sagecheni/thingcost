# 物纪 · Chronicle — 技术架构

状态：实现基线

## 1. 总体结构

采用 TypeScript monorepo，运行时由三个进程和一个数据库组成：

```text
Browser
  │ same-origin HTTP
  ▼
App/API (Fastify)
  ├── serves built React assets
  ├── REST / OpenAPI
  ├── authentication and sessions
  ├── attachment authorization
  └── domain services
         │
         ▼
     PostgreSQL ◀──── Worker
                      ├── scheduled reminders
                      ├── notification delivery
                      └── exchange-rate jobs
```

生产 Compose 服务：

- `app`：Fastify API，同时提供 React 静态资源。
- `worker`：与 app 使用同一应用镜像，以不同命令启动。
- `postgres`：PostgreSQL。

不引入 Redis。后台队列、定时任务、唯一性和重试状态使用 PostgreSQL 支撑。

## 2. 推荐技术组件

### 2.1 Web

- React
- Vite
- TanStack Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS + headless accessible primitives
- Apache ECharts（趋势、构成和生命周期图）

### 2.2 API 与 Worker

- Fastify
- `fastify-type-provider-zod`
- OpenAPI 文档与生成客户端
- Drizzle ORM + Drizzle migrations
- PostgreSQL-backed job queue（优先评估 `pg-boss`）
- Argon2id 密码哈希
- Pino 结构化日志与敏感字段脱敏

### 2.3 工程质量

- pnpm workspaces
- TypeScript strict mode
- ESLint
- Prettier
- Vitest
- Playwright（关键用户路径）
- Changesets 或等价版本变更记录（发布阶段引入）

依赖的具体版本在初始化时锁定，并由 lockfile 保证可复现。

## 3. Monorepo 布局

```text
apps/
  web/             React SPA
  api/             Fastify app and production entrypoint
  worker/          background worker entrypoint
packages/
  contracts/       Zod request/response and domain contracts
  database/        Drizzle schema, migrations and repositories
  domain/          pure calculations and lifecycle rules
  config/          typed environment configuration
  ui/              shared design tokens and UI primitives
  test-utils/      factories and integration helpers
docs/
  product-spec.md
  architecture.md
  roadmap.md
```

领域计算放在无 I/O 的 `packages/domain` 中，确保成本、自然日和状态区间规则可进行高覆盖率单元测试。

## 4. API 设计

- 稳定接口前缀：`/api/v1`。
- JSON REST API；文件上传使用 multipart。
- OpenAPI 是 API 对外契约；运行时文档位于 `/api/docs`，机器可读契约位于 `/api/v1/openapi.json`。
- 错误使用稳定的机器码、中文默认消息和可选字段级详情。
- 列表统一使用明确的筛选/分页契约；筛选参数可序列化到 URL。
- 所有写操作在服务层执行授权与领域校验，不依赖前端约束。
- 受保护端点默认接受会话 Cookie 或个人访问令牌（二者择一）。

个人访问令牌：

- 默认禁用，需管理员在「数据与备份」中显式启用。
- Token 只在创建时显示一次，数据库仅保存 SHA-256 哈希与前缀。
- Scope：`assets:read` / `assets:write`、`orders:read`、`wishlist:read` / `wishlist:write`、`reminders:read` / `reminders:manage`、`attachments:read`。
- 手工价格快照属于 `wishlist:write`；导出/导入与令牌管理仅允许会话。

## 5. 身份认证

### 5.1 初始化

- 若不存在管理员，访问应用进入一次性初始化流程。
- 环境变量可预配置管理员与基础设置，用于无人值守部署。
- 初始化成功后，环境变量不能静默覆盖现有密码。
- 忘记密码通过容器内 CLI 显式重置，不提供邮件找回。

### 5.2 会话

- 密码使用 Argon2id 强哈希。
- 随机会话 Token；数据库只保存 Token 哈希。
- Cookie：HttpOnly、SameSite=Lax；在 HTTPS 部署时强制 Secure。
- 登录轮换会话、防固定会话、有限速和失败退避。
- 对状态修改请求执行 Origin/Host 校验；不依赖 Cookie SameSite 作为唯一 CSRF 防线。
- 管理员修改密码后可撤销其他全部会话。

## 6. 数据模型原则

### 6.1 事件与当前投影

关键事实保留事件历史，同时维护可高效读取的当前投影：

- `assets` 保存当前可编辑资料与当前状态引用。
- `lifecycle_events` 保存状态区间事实。
- `financial_events` 保存不可无痕覆盖的资金事实与更正关系。
- `condition_events` 保存成色变化。
- 旧版本 `valuation_reports`、`valuation_snapshots` 与 `valuation_schedules` 仅为迁移兼容保留，不属于当前产品流程。

普通标题和备注允许直接编辑。影响统计的更正必须留下原记录与更正关系。

### 6.2 金额

- `amount_minor`：有符号 64 位整数。
- `currency_code`：ISO 4217 三字母代码。
- `base_amount_minor`：锁定汇率换算后的基础币金额。
- 汇率使用精确 decimal/numeric，不使用 JS 浮点数进行入账计算。
- 物品资金事件与订单同时保存原币金额、基础币金额、锁定汇率、来源、参考日期与回退标记。
- Frankfurter v2 只提供历史参考汇率；缺少当日数据时向前查找最近有效日。用户可用账单实际结算汇率覆盖参考值，已入账记录不会被后续汇率变化重写。

### 6.3 日期与时间

- 购买日、处置日等“日历事实”使用 PostgreSQL `date`。
- 提醒发送时间、事件创建时间等使用 `timestamptz`，统一以 UTC 保存。
- 应用设置保存 IANA 时区，默认 `Asia/Shanghai`。
- 自然日计算必须在领域层显式传入时区。

### 6.4 软删除

- 业务归档/处置不等于删除。
- 回收站使用 `deleted_at` 和计划清理时间。
- 清理任务只删除已过保留期且未恢复的数据，并保证附件引用安全。

### 6.5 订单分摊与配件

- `purchase_orders` 保存订单级原价、优惠、运费、税费、其他费用与实付总额；数据库约束总额恒等式。
- `purchase_order_items` 保存每件物品的原价、各项共享费用份额、平衡差额与最终取得成本；每行也受金额恒等式约束。
- 默认按原价权重使用最大余数法分配到最小货币单位；余数相同时按稳定商品顺序回收，确保结果可重现。
- 手工分摊必须覆盖所有商品且总和精确等于订单实付；与比例基准的差异作为可解释的分摊平衡额保存。
- 提交订单、创建物品、初始生命周期事件与取得资金事件在同一数据库事务中完成。已提交订单属于资金历史，当前切片不允许直接覆盖或删除。
- 外币订单在订单层锁定汇率；基础币订单总额按该汇率换算后，再以最大余数法分配到各物品资金事件，确保基础币最小单位总额守恒。
- 配件（如充电头）默认作为独立物品记账，不提供“属于/搭配”关系管理界面。若只需把费用挂在主机生命周期净成本上、不单独建物品，可继续使用 `accessory` 或 `upgrade` 资金事件。底层关系表仍可保留以兼容旧数据，但不再作为产品能力暴露。

### 6.6 种草与购买转换

- `wishlist_items` 保存当前价格投影、目标价格、预算、优先级、计划购买日期与状态；当前价格必须来自价格快照，不能绕过历史直接修改。
- `wishlist_marketplace_links` 只保存公开商品链接与备注，不保存商城 Cookie、账号或自动登录信息。
- `wishlist_price_snapshots` 保存每次手工观测的最小货币单位金额、日期和可选平台来源；转为物品后仍完整保留。
- `wishlist_images` 使用与物品附件相同的私有随机存储和鉴权读取边界，每条种草记录保留一张可替换封面。
- “转为物品”在单一事务中创建资产、初始生命周期事件和可选取得资金事件，同时把种草记录锁定为 `converted` 并保存目标资产引用，避免重复转换。
- 种草价格可以使用任意 ISO 4217 币种，因为它不进入现金账本；在锁定汇率切片完成前，只有基础币种价格可以直接转换为已知取得成本。

## 7. 历史统计

- 权威来源是资金和生命周期事件。
- 当前指标可通过投影加速。
- 历史趋势按“截至某日”的事件重建。
- 后续可增加每日汇总表作为缓存，但缓存必须可由权威事件完全重建。
- 时区、自然日包含规则和公式版本应进入计算上下文，避免升级后无法解释历史差异。

## 8. Worker 与任务可靠性

- 每类任务有稳定幂等键，防止重复通知。
- 使用数据库事务保证业务变更与任务入队的一致性。
- 指数退避、有上限重试、死信/失败状态和人工重试入口。
- 一个通知 Provider 失败不能阻止其他 Provider。
- Worker 停机期间到期任务在恢复后按策略补发一次，不能形成通知风暴。
- 外部请求设置连接/响应超时、并发上限和结构化审计元数据。

## 9. 外部集成边界

外部能力全部通过 Provider 接口：

- `ExchangeRateProvider`：默认 Frankfurter v2。
- `NotificationProvider`：Telegram、Webhook、企业微信群机器人、Server酱、PushPlus；每个渠道均支持管理员测试发送。
- 订阅与数字许可使用独立表 `subscriptions` / `subscription_price_changes` / `subscription_charges`，不伪装成实物 `assets`；只存账号标识与密码管理器外链，永不存密码或 License Key。
- 订阅通过 `subscription_tags`、`subscription_attachments` 与通用提醒 `reminders.subscription_id` 共享标签、私有资料和提醒能力。
- 种草价格只接受用户主动录入的手工快照；不设计购物平台自动采集 Provider。

原则：

- Provider 缺失或故障不影响核心 CRUD 与本地统计。
- 设置页显示所有外部连接、最近状态与测试按钮。
- Base URL、模型名、超时和限额均可配置。
- 密钥在日志、导出、错误响应和遥测中永不出现。

## 10. 密钥与附件

- 环境变量可锁定某项 Provider 配置。
- Web 设置中的密钥由主密钥使用经过认证的加密算法加密后入库；支持 Telegram、Webhook、企业微信、Server酱和 PushPlus 的数据库渠道。
- 主密钥只来自环境/secret，不进入数据库或便携导出。
- 备份与导出默认排除所有 Provider 密钥和个人 Token。
- Portable Export v1 对旧版本估值记录保持兼容，并同步保存订阅价格历史、扣款、标签和私有订阅附件；replace import 恢复原始 ID 与存储键。

附件：

- 位于挂载目录，随机对象 ID 作为存储名。
- 原始文件名只作为数据库元数据，经输出头安全编码。
- 不信任浏览器 MIME 或扩展名；根据大小、内容签名与图片解码结果确定允许类型。
- 原图保持不变，上传时同步生成受像素数与边长限制的 WebP 缩略图。
- 下载必须经过身份认证与对象级检查。
- 首版不做应用层附件加密。

## 11. 前端与设计系统

品牌：**物纪 · Chronicle**。视觉采用现代数据面板为主体，像素元素和“岁痕”纹理作点缀。

- 支持浅色/深色/跟随系统。
- 正文和数值使用高可读字体；像素字体只用于极少量装饰。
- 颜色不是状态的唯一表达，图表提供文字、图例与可访问标签。
- 桌面和手机均为一等公民；不采用“桌面页面简单缩小”的方式。
- 手机优先优化快速录入、拍照、搜索和状态切换。
- 首版不注册 Service Worker，不宣称 PWA 或离线能力。
- 所有字体、图标和前端资源随应用镜像提供，不依赖公网 CDN。

## 12. Docker 与发布

- Linux `amd64` 与 `arm64` 多架构镜像。
- 多阶段构建；运行阶段使用非 root 用户和最小运行依赖。
- `app` 与 `worker` 可共享镜像，但使用不同启动命令。
- 健康检查区分存活与就绪；数据库迁移使用单独、可观察的启动步骤。
- 不挂载 Docker Socket，不在应用内自我更新。
- 使用语义化版本标签；不建议生产环境跟随 `latest`。
- 升级前检查数据库兼容性，迁移失败时拒绝以半迁移状态提供服务。

持久化：

- PostgreSQL 数据卷
- 附件目录
- 浏览器下载的手工可移植归档

应用内 `Chronicle Export v1` 先在服务器临时生成 ZIP，完整写入后再下载，并在响应结束后清理临时文件。归档包含版本化 JSON、核心 CSV、原始附件、缩略图和逐文件 SHA-256 清单；管理员密码、登录会话、主密钥和通知渠道密文不进入归档。

导入流程为：上传 ZIP → 校验清单与 SHA-256 → 冲突预览 → 显式确认 replace。replace 会清空业务与目录数据后按原 ID 写回，并按 storage key 恢复附件；管理员账号与当前会话保留。通知渠道密钥不在归档中，导入时跳过，需重新配置。

部署文档仍必须说明 PostgreSQL 与附件的一致性备份方法；应用内导入适合迁移与核验，不能替代底层卷级灾备。

## 13. 可观测性与隐私

- JSON 结构化日志，默认不记录请求正文、Cookie、Authorization 或上传内容。
- 健康与就绪端点不泄露配置详情。
- 本地管理界面可查看任务失败与 Provider 状态。
- 不发送匿名遥测。
- 可选版本检查默认关闭，只提交当前版本和系统架构，并明确显示目标地址。
- AI 请求日志只保存经过过滤的必要元数据和用户选择保留的证据。

## 14. 国际化

- 第一版只提供简体中文文案。
- 从第一天接入国际化框架，禁止在业务组件中散落不可提取文案。
- 数字、日期、货币和时区使用 Locale-aware 格式化。
- 数据库存稳定代码，显示名称通过翻译层提供。
