# 物纪 · Chronicle

> 记录每一件拥有的时间与价值。

物纪是一个面向个人、自托管的物品生命周期与成本管理服务。项目正在按可运行的垂直里程碑开发。

## 当前状态

Milestone 2 已形成可日常使用的资产成本洞察版本；Milestone 3 的附件、购买订单和提醒通知切片也已可用：

- 首次初始化、单管理员会话与 CLI 密码重置
- 物品创建、编辑、标签、筛选、排序和回收站删除
- 状态、资金、成色、缺陷、借出归还与维修时间线
- 持有/服役天数、生命周期净成本和净日均成本
- 当前组合日均成本、净投入、期间支出、完整度与状态洞察
- ECharts 成本趋势、分类构成和最近活动
- 响应式卡片/表格视图，以及浅色、深色、跟随系统主题
- 私有照片与 PDF 凭证、自动缩略图、封面、相册排序和相机上传
- 附件随机化存储、登录鉴权读取、类型嗅探、大小限制及持久卷
- 多商品订单、共享优惠与费用精确分摊、订单直接生成物品及取得资金事件
- 配件与主机一律作为独立物品记录；若只需把费用记在主机上，可继续使用 `accessory` / `upgrade` 资金事件
- 一次性与周期提醒、多提前量、待确认任务、稍后提醒和暂停规则
- PostgreSQL Worker 任务、Telegram/Webhook 渠道、发送日志、失败重试和幂等保护
- 提醒中心、物品快捷提醒、Dashboard 到期提醒和响应式移动端表单
- PostgreSQL 迁移、集成测试和 Docker Compose 部署
- 种草清单：封面图片、多个平台链接、目标价、预算、优先级和计划日期
- 手工价格快照与价格曲线，以及转为正式物品时保留完整价格历史；不提供购物平台自动追价
- 多币种物品、资金事件、订单与种草转入；原币和锁定基础币金额同时留存
- Frankfurter v2 历史参考汇率、最近前一有效日回退，以及可覆盖的实际结算汇率
- Chronicle Export v1 可移植 ZIP：完整 JSON、核心 CSV、原始附件与 SHA-256 校验清单
- 完整导入：格式校验、冲突预览与 replace 覆盖恢复（保留当前管理员）
- 个人访问令牌：默认关闭、创建时只显示一次，并按物品、种草、提醒与附件等 Scope 做最小权限隔离
- OpenAPI 文档：`/api/docs`（UI）与 `/api/v1/openapi.json`（机器可读契约）
- 订阅与数字许可：独立于实物资产的周期订阅/买断许可、计划与实际扣款、预计月/年支出
- 通知渠道：Telegram、通用 Webhook、企业微信群机器人、Server酱、PushPlus；支持管理员测试发送
- 订阅与数字许可：试用转正式、优惠与涨价历史、失败扣款、取消/暂停/恢复/续费、标签、私有资料附件和关联提醒
- 回收站：列表、恢复、强确认永久删除与 Worker 到期清理
- 国际化基础设施：简体中文默认，支持 English 切换并持久化语言偏好
- Portable Export/Import 同步覆盖订阅价格历史、扣款、标签、附件和关联提醒；旧版本归档中的估值记录仅作兼容保留

完整范围与约束：

- [产品规格](docs/product-spec.md)
- [技术架构](docs/architecture.md)
- [交付路线](docs/roadmap.md)
- [Docker 部署](docs/deployment.md)

## Docker 快速启动

```bash
cp .env.example .env
# 修改 .env 中的 POSTGRES_PASSWORD
docker compose up -d --build
```

打开 <http://localhost:3000>。正式部署和手工备份要求见[部署文档](docs/deployment.md)。

## 本地开发

要求：

- Node.js 22.12+
- pnpm 11+
- PostgreSQL 16+

确保 `.env` 中 `DATABASE_URL` 的密码与 `POSTGRES_PASSWORD` 相同，然后执行：

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

默认开发地址：

- Web：<http://localhost:5173>
- API：<http://localhost:3000>
- API 存活检查：<http://localhost:3000/health/live>

## 工程检查

```bash
pnpm check
```

带 PostgreSQL 的 API 集成测试：

```bash
TEST_DATABASE_URL=postgres://chronicle:密码@localhost:5432/chronicle \
  pnpm --filter @thingcost/api test
```

## 项目结构

```text
apps/web       React 响应式 Web
apps/api       Fastify API 与生产静态资源服务
apps/worker    后台任务进程
packages/*     契约、领域、数据库、配置与 UI 包
```

## 许可证

尚未决定。正式公开发布前会明确许可证；当前代码不附带开源授权。
