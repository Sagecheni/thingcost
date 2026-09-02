# 物纪 · Chronicle

> 记录每一件拥有的时间与价值。

物纪是一个**自托管的个人物品生命周期与成本账本**：每件耐用品从取得、使用、借出、维修到告别，都有可追溯的时间线和可解释的日均成本。单管理员、数据全在你自己的服务器上，核心功能不依赖任何外部服务。

视觉上是它的另一面旗：整个前端按**当票/账房**的世界观手工设计——每件物品是一张当票，日均成本是票面金额，未知成本绝不渲染成零。

<!-- 截图：建议放总览仪表盘、资产详情页（当票）、暗色载体 2–3 张 -->

## 能做什么

**资产账本**

- 物品生命周期全记录：取得、状态流转、资金事件、成色缺陷、借出归还、维修
- 持有/服役天数、生命周期净成本、净日均成本，全部口径透明可解释
- 未知成本就是未知——用琥珀色"待办勾注"标记，绝不按零计入任何合计
- 覆盖回收站（30 天后悔期）、照片与 PDF 私有附件、分类与标签、筛选排序

**订阅与提醒**

- 订阅与数字许可账本：试用/买断、计划与实际扣款、预计月/年支出、涨价历史
- 一次性与周期提醒、提前量、稍后/暂停，Telegram、Webhook、企业微信、Server酱、PushPlus、Bark 等通知渠道
- 愿望清单（种草）：目标价、手工价格快照与曲线，转正时保留完整价格历史

**数据主权**

- Chronicle Export/Import：完整 JSON + CSV + 原始附件的可移植归档，冲突预览与恢复
- 多币种：原币与锁定基础币同时留存，历史参考汇率可覆盖为实际结算汇率
- 个人访问令牌（默认关闭、最小权限 Scope）、OpenAPI 契约（`/api/docs`）

## 设计语言：当票与朱砂印

物纪的界面不是对一个设计系统的套用，而是一个完整手工世界观的实现：

- **每件物品一张当票**——头联（分类与票号）、票面（日均成本大数字）、骑缝（撕口与半印）、存根脚
- **朱砂方印**——白文篆意"物纪"，登录、保存、更正、收笔处的凭信；更正/作废盖长条骑缝戳
- **库房货架**——分类版图按《千字文》"天地玄黄宇宙洪荒"编号归架，一格一类
- **铅字块**——分类首字入描边小方块，活字式扫读锚点
- **陈纸**——在册越久，票面向茶色渐变（JND 量化五档）；新墨迹未干，老账纸色微陈
- **墨线落笔**——成本曲线的墨色由淡到浓，最新一笔落朱砂顿点
- **双谱系四载体**——当票（宣纸正联 / 碑拓负片）与蓝印底册（正联 / 蓝靛），正交明暗主题
- 直角、无投影、无毛玻璃、宋体标题、等宽数字；对比度与色阶由 `pnpm tokens:check` 在 CI 里强制

## 技术栈

TypeScript monorepo（pnpm workspace / ESM / Node.js 22.12+）

| 层     | 技术                                                           |
| ------ | -------------------------------------------------------------- |
| Web    | React 19、Vite、TanStack Router/Query、Tailwind CSS 4、ECharts |
| API    | Fastify、Zod 契约（前后端共享）、OpenAPI                       |
| 数据   | PostgreSQL 16+、Drizzle ORM                                    |
| Worker | pg-boss 后台任务（提醒、回收站清理等）                         |

## 快速开始（Docker）

```bash
cp .env.example .env
# 修改 .env 中的 POSTGRES_PASSWORD
docker compose up -d --build
```

打开 <http://localhost:3000> 完成首次初始化。生产部署要求与手工备份流程见[部署文档](docs/deployment.md)。

## 本地开发

要求 Node.js 22.12+、pnpm 11+、PostgreSQL 16+（`.env` 的 `DATABASE_URL` 密码与 `POSTGRES_PASSWORD` 一致）：

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

- Web：<http://localhost:5173>　·　API：<http://localhost:3000>　·　存活检查：`/health/live`

## 工程检查

```bash
pnpm check          # tokens:check → format → lint → typecheck → test → build
pnpm tokens:check   # 主题色板：对比度、链接与主操作分离、色阶单调、陈纸放宽条款
TEST_DATABASE_URL=postgres://chronicle:密码@localhost:5432/chronicle \
  pnpm --filter @thingcost/api test   # API 集成测试
```

## 项目结构

```text
apps/web        React 响应式 Web（当票/账本视觉层）
apps/api        Fastify API 与生产静态资源服务
apps/worker     后台任务进程（通知、清理）
packages/*      Zod 契约、领域计算、Drizzle 数据层、配置、UI 工具
design-system/  设计语言规范（当票方向）
docs/           产品规格、架构、路线、部署
```

## 文档

- [产品规格](docs/product-spec.md) · [技术架构](docs/architecture.md) · [交付路线](docs/roadmap.md) · [Docker 部署](docs/deployment.md)
- [设计语言](design-system/pawnshop.md) · [提交与协作约定](AGENTS.md)

## 许可证

尚未决定，仓库公开前会选择并补充 `LICENSE` 文件；在此之前代码不附带开源授权。
