import { createHash } from 'node:crypto';

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { RuntimeConfig } from '@thingcost/config';
import {
  valuationEvidenceSchema,
  valuationForecastSegmentSchema,
  valuationOutboundSummarySchema,
  type ConfirmValuationInput,
  type UpdateValuationScheduleInput,
  type ValuationAnalytics,
  type ValuationPreview,
  type ValuationReport,
  type ValuationSchedule,
  type ValuationSnapshot,
  type ValuationTriggerSource,
} from '@thingcost/contracts';
import {
  appSettings,
  valuationReports,
  valuationSchedules,
  valuationSearchCache,
  valuationSnapshots,
  type Database,
} from '@thingcost/database';
import {
  buildValuationOutboundSummary,
  calculateAnnualizedDepreciationRate,
  nextValuationRunAt,
  valuationSearchQuery,
} from '@thingcost/domain';

import {
  AiProviderError,
  ChatCompletionsAiProvider,
  FixtureAiProvider,
  ResponsesAiProvider,
  type AiProvider,
} from './ai-providers.js';
import { getAssetDetail } from './assets.js';
import {
  FixtureSearchProvider,
  SearchProviderError,
  TavilySearchProvider,
  type SearchProvider,
} from './search-providers.js';
import { currentDateInTimeZone } from '../lib/dates.js';

export class ValuationServiceError extends Error {
  constructor(
    readonly code:
      | 'ASSET_NOT_FOUND'
      | 'NOT_CONFIGURED'
      | 'OUTBOUND_NOT_CONFIRMED'
      | 'REPORT_NOT_FOUND'
      | 'REPORT_NOT_READY'
      | 'PROVIDER_FAILED'
      | 'INVALID_VALUE'
      | 'NOT_ADOPTABLE'
      | 'BUDGET_EXCEEDED',
    message: string,
  ) {
    super(message);
    this.name = 'ValuationServiceError';
  }
}

export interface ValuationDependencies {
  searchProvider?: SearchProvider | null | undefined;
  aiProvider?: AiProvider | null | undefined;
}

function mapReport(row: typeof valuationReports.$inferSelect): ValuationReport {
  return {
    id: row.id,
    assetId: row.assetId,
    status: row.status,
    currency: row.currency,
    lowMinor: row.lowMinor?.toString() ?? null,
    midMinor: row.midMinor?.toString() ?? null,
    highMinor: row.highMinor?.toString() ?? null,
    confidence: row.confidence,
    summary: row.summary,
    evidence: valuationEvidenceSchema.array().parse(JSON.parse(row.evidenceJson)),
    forecasts: valuationForecastSegmentSchema
      .array()
      .parse(JSON.parse(row.forecastsJson)),
    outboundSummary: valuationOutboundSummarySchema.parse(
      JSON.parse(row.outboundSummaryJson),
    ),
    searchProvider: row.searchProvider,
    aiProvider: row.aiProvider,
    aiProtocol: row.aiProtocol,
    aiModel: row.aiModel,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    triggerSource: row.triggerSource,
    searchCacheHit: row.searchCacheHit,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    adoptedSnapshotId: row.adoptedSnapshotId,
  };
}

function mapSchedule(row: typeof valuationSchedules.$inferSelect): ValuationSchedule {
  return {
    assetId: row.assetId,
    cadence: row.cadence,
    enabled: row.enabled,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastReportId: row.lastReportId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSnapshot(row: typeof valuationSnapshots.$inferSelect): ValuationSnapshot {
  return {
    id: row.id,
    assetId: row.assetId,
    reportId: row.reportId,
    currency: row.currency,
    valueMinor: row.valueMinor.toString(),
    lowMinor: row.lowMinor?.toString() ?? null,
    highMinor: row.highMinor?.toString() ?? null,
    confidence: row.confidence,
    valuedOn: row.valuedOn,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function resolveSearchProvider(
  config: RuntimeConfig,
  override?: SearchProvider | null,
): SearchProvider | null {
  if (override !== undefined) return override;
  if (config.NODE_ENV === 'test') return new FixtureSearchProvider();
  if (!config.TAVILY_API_KEY) return null;
  return new TavilySearchProvider(config.TAVILY_API_KEY, config.TAVILY_BASE_URL);
}

export function resolveAiProvider(
  config: RuntimeConfig,
  override?: AiProvider | null,
): AiProvider | null {
  if (override !== undefined) return override;
  if (config.NODE_ENV === 'test') return new FixtureAiProvider();
  if (!config.AI_BASE_URL || !config.AI_API_KEY || !config.AI_MODEL) return null;
  if (config.AI_PROTOCOL === 'responses') {
    return new ResponsesAiProvider(
      config.AI_PROVIDER_NAME,
      config.AI_MODEL,
      config.AI_BASE_URL,
      config.AI_API_KEY,
      config.AI_TIMEOUT_MS,
    );
  }
  return new ChatCompletionsAiProvider(
    config.AI_PROVIDER_NAME,
    config.AI_MODEL,
    config.AI_BASE_URL,
    config.AI_API_KEY,
    config.AI_TIMEOUT_MS,
  );
}

async function countMonthlyRuns(db: Database): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(valuationReports)
    .where(gte(valuationReports.createdAt, monthStart));
  return row?.count ?? 0;
}

async function searchWithCache(
  db: Database,
  config: RuntimeConfig,
  searchProvider: SearchProvider,
  query: string,
): Promise<{
  results: Awaited<ReturnType<SearchProvider['search']>>;
  cacheHit: boolean;
}> {
  const queryHash = createHash('sha256').update(query).digest('hex');
  const now = new Date();
  const [cached] = await db
    .select()
    .from(valuationSearchCache)
    .where(
      and(
        eq(valuationSearchCache.queryHash, queryHash),
        gte(valuationSearchCache.expiresAt, now),
      ),
    )
    .limit(1);
  if (cached) {
    return {
      results: JSON.parse(cached.resultsJson) as Awaited<
        ReturnType<SearchProvider['search']>
      >,
      cacheHit: true,
    };
  }

  const results = await searchProvider.search(query, { maxResults: 6 });
  const expiresAt = new Date(now.getTime() + config.AI_SEARCH_CACHE_TTL_MS);
  await db
    .insert(valuationSearchCache)
    .values({
      queryHash,
      queryText: query.slice(0, 500),
      resultsJson: JSON.stringify(results),
      provider: searchProvider.name,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: valuationSearchCache.queryHash,
      set: {
        resultsJson: JSON.stringify(results),
        provider: searchProvider.name,
        expiresAt,
        createdAt: now,
        queryText: query.slice(0, 500),
      },
    });
  return { results, cacheHit: false };
}

async function buildOutboundForAsset(db: Database, assetId: string) {
  const detail = await getAssetDetail(db, assetId);
  if (!detail) {
    throw new ValuationServiceError('ASSET_NOT_FOUND', '没有找到该物品');
  }

  const [settings] = await db.select().from(appSettings).limit(1);
  if (!settings) {
    throw new ValuationServiceError('NOT_CONFIGURED', '应用尚未初始化');
  }

  const latestCondition = detail.currentCondition ?? detail.conditionEvents[0] ?? null;
  const outboundSummary = buildValuationOutboundSummary({
    asset: {
      id: detail.id,
      name: detail.name,
      brand: detail.brand,
      model: detail.model,
      categoryName: detail.category.name,
      acquisitionDate: detail.acquisitionDate,
      acquisitionType: detail.acquisitionType,
      conditionGrade: latestCondition?.grade ?? null,
      defectLabels: (latestCondition?.defects ?? []).map(
        (defect) => defect.description || defect.type,
      ),
      // Only a short public description is allowed outbound.
      publicDescription: detail.description ? detail.description.slice(0, 500) : null,
    },
    regionHint: settings.timeZone.startsWith('Asia/') ? 'CN' : 'GLOBAL',
    baseCurrency: settings.baseCurrency,
  });

  return { detail, settings, outboundSummary };
}

export async function getValuationPreview(
  db: Database,
  config: RuntimeConfig,
  assetId: string,
  dependencies: ValuationDependencies = {},
): Promise<ValuationPreview> {
  const { outboundSummary } = await buildOutboundForAsset(db, assetId);
  const searchProvider = resolveSearchProvider(config, dependencies.searchProvider);
  const aiProvider = resolveAiProvider(config, dependencies.aiProvider);

  const notes = [
    '只会发送下列公开摘要，不包含序列号、发票、附件、借用人或私人备注原文以外的敏感字段。',
    'AI 估值仅为建议，确认前不会写入采用估值快照，也不会修改现金账本。',
  ];
  if (!searchProvider) notes.push('未配置 Tavily，估值检索不可用。');
  if (!aiProvider) notes.push('未配置 AI Provider，估值生成不可用。');

  return {
    outboundSummary,
    providers: {
      searchConfigured: Boolean(searchProvider),
      aiConfigured: Boolean(aiProvider),
      searchProvider: searchProvider?.name ?? null,
      aiProvider: aiProvider?.name ?? null,
      aiProtocol: aiProvider?.protocol ?? null,
      aiModel: aiProvider?.model ?? null,
    },
    notes,
  };
}

export async function listValuationReports(
  db: Database,
  assetId: string,
): Promise<ValuationReport[]> {
  const rows = await db
    .select()
    .from(valuationReports)
    .where(eq(valuationReports.assetId, assetId))
    .orderBy(desc(valuationReports.createdAt));
  return rows.map(mapReport);
}

export async function listValuationSnapshots(
  db: Database,
  assetId: string,
): Promise<ValuationSnapshot[]> {
  const rows = await db
    .select()
    .from(valuationSnapshots)
    .where(eq(valuationSnapshots.assetId, assetId))
    .orderBy(desc(valuationSnapshots.valuedOn), desc(valuationSnapshots.createdAt));
  return rows.map(mapSnapshot);
}

export async function runManualValuation(
  db: Database,
  config: RuntimeConfig,
  assetId: string,
  confirmOutboundSummary: true,
  dependencies: ValuationDependencies = {},
  triggerSource: ValuationTriggerSource = 'manual',
): Promise<ValuationReport> {
  if (confirmOutboundSummary !== true) {
    throw new ValuationServiceError(
      'OUTBOUND_NOT_CONFIRMED',
      '请先确认即将外发的数据摘要',
    );
  }

  const monthlyRuns = await countMonthlyRuns(db);
  if (config.AI_MONTHLY_BUDGET > 0 && monthlyRuns >= config.AI_MONTHLY_BUDGET) {
    throw new ValuationServiceError(
      'BUDGET_EXCEEDED',
      `本月估值次数已达预算上限（${String(config.AI_MONTHLY_BUDGET)}）`,
    );
  }

  const { settings, outboundSummary } = await buildOutboundForAsset(db, assetId);
  const searchProvider = resolveSearchProvider(config, dependencies.searchProvider);
  const aiProvider = resolveAiProvider(config, dependencies.aiProvider);

  if (!searchProvider || !aiProvider) {
    throw new ValuationServiceError(
      'NOT_CONFIGURED',
      '估值 Provider 未配置；核心记账功能仍可正常使用',
    );
  }

  const startedAt = Date.now();
  const [created] = await db
    .insert(valuationReports)
    .values({
      assetId,
      status: 'running',
      currency: settings.baseCurrency,
      outboundSummaryJson: JSON.stringify(outboundSummary),
      searchProvider: searchProvider.name,
      aiProvider: aiProvider.name,
      aiProtocol: aiProvider.protocol,
      aiModel: aiProvider.model,
      triggerSource,
    })
    .returning();

  if (!created) {
    throw new Error('Unable to create valuation report.');
  }

  try {
    const { results: searchResults, cacheHit } = await searchWithCache(
      db,
      config,
      searchProvider,
      valuationSearchQuery(outboundSummary),
    );
    const draft = await aiProvider.generateValuation({
      outboundSummary,
      searchResults,
    });

    const adoptable =
      draft.evidence.length > 0 &&
      Boolean(draft.confidence) &&
      Boolean(draft.summary.trim());

    const [updated] = await db
      .update(valuationReports)
      .set({
        status: adoptable ? 'ready' : 'failed',
        lowMinor: BigInt(draft.lowMinor),
        midMinor: BigInt(draft.midMinor),
        highMinor: BigInt(draft.highMinor),
        confidence: draft.confidence,
        summary: draft.summary,
        evidenceJson: JSON.stringify(draft.evidence),
        forecastsJson: JSON.stringify(draft.forecasts),
        searchProvider: searchProvider.name,
        aiProvider: draft.provider,
        aiProtocol: draft.protocol,
        aiModel: draft.model,
        searchCacheHit: cacheHit,
        durationMs: Date.now() - startedAt,
        errorCode: adoptable ? null : 'NOT_ADOPTABLE',
        errorMessage: adoptable ? null : '估值缺少证据或置信度，标记为不可采用',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(valuationReports.id, created.id))
      .returning();

    const report = mapReport(updated ?? created);
    if (!adoptable) {
      throw new ValuationServiceError(
        'NOT_ADOPTABLE',
        '估值缺少证据或置信度，标记为不可采用',
      );
    }
    return report;
  } catch (error) {
    if (error instanceof ValuationServiceError && error.code === 'NOT_ADOPTABLE') {
      throw error;
    }
    const message =
      error instanceof SearchProviderError || error instanceof AiProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : '估值失败';
    const code =
      error instanceof SearchProviderError || error instanceof AiProviderError
        ? error.code
        : 'PROVIDER_FAILED';

    await db
      .update(valuationReports)
      .set({
        status: 'failed',
        errorCode: code,
        errorMessage: message.slice(0, 1000),
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(valuationReports.id, created.id));

    if (error instanceof ValuationServiceError) throw error;
    throw new ValuationServiceError('PROVIDER_FAILED', message);
  }
}

export async function confirmValuationReport(
  db: Database,
  assetId: string,
  reportId: string,
  input: ConfirmValuationInput,
): Promise<{ report: ValuationReport; snapshot: ValuationSnapshot }> {
  const [report] = await db
    .select()
    .from(valuationReports)
    .where(eq(valuationReports.id, reportId))
    .limit(1);

  if (!report || report.assetId !== assetId) {
    throw new ValuationServiceError('REPORT_NOT_FOUND', '没有找到该估值报告');
  }
  if (report.status !== 'ready' && report.status !== 'adopted') {
    throw new ValuationServiceError('REPORT_NOT_READY', '只有就绪的估值报告可以确认采用');
  }
  if (report.midMinor === null) {
    throw new ValuationServiceError('REPORT_NOT_READY', '估值报告缺少中位值');
  }

  const evidence = valuationEvidenceSchema.array().parse(JSON.parse(report.evidenceJson));
  if (evidence.length === 0 || !report.confidence) {
    throw new ValuationServiceError(
      'NOT_ADOPTABLE',
      '缺少证据或置信度的估值报告不能确认采用',
    );
  }

  const valueMinor = input.valueMinor ? BigInt(input.valueMinor) : report.midMinor;
  if (valueMinor < 0n) {
    throw new ValuationServiceError('INVALID_VALUE', '采用估值不能为负');
  }

  const [settings] = await db.select().from(appSettings).limit(1);
  const valuedOn = currentDateInTimeZone(settings?.timeZone ?? 'Asia/Shanghai');

  const result = await db.transaction(async (tx) => {
    const [snapshot] = await tx
      .insert(valuationSnapshots)
      .values({
        assetId,
        reportId: report.id,
        currency: report.currency,
        valueMinor,
        lowMinor: report.lowMinor,
        highMinor: report.highMinor,
        confidence: report.confidence,
        valuedOn,
        note: input.note?.trim() || null,
      })
      .returning();

    if (!snapshot) {
      throw new Error('Unable to create valuation snapshot.');
    }

    const [updatedReport] = await tx
      .update(valuationReports)
      .set({
        status: 'adopted',
        adoptedSnapshotId: snapshot.id,
        updatedAt: new Date(),
      })
      .where(eq(valuationReports.id, report.id))
      .returning();

    return {
      report: mapReport(updatedReport ?? report),
      snapshot: mapSnapshot(snapshot),
    };
  });

  return result;
}

export async function getValuationSchedule(
  db: Database,
  assetId: string,
): Promise<ValuationSchedule> {
  const detail = await getAssetDetail(db, assetId);
  if (!detail) {
    throw new ValuationServiceError('ASSET_NOT_FOUND', '没有找到该物品');
  }
  const [row] = await db
    .select()
    .from(valuationSchedules)
    .where(eq(valuationSchedules.assetId, assetId))
    .limit(1);
  if (row) return mapSchedule(row);
  return {
    assetId,
    cadence: 'manual',
    enabled: false,
    nextRunAt: null,
    lastRunAt: null,
    lastReportId: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateValuationSchedule(
  db: Database,
  assetId: string,
  input: UpdateValuationScheduleInput,
): Promise<ValuationSchedule> {
  const detail = await getAssetDetail(db, assetId);
  if (!detail) {
    throw new ValuationServiceError('ASSET_NOT_FOUND', '没有找到该物品');
  }

  const enabled = input.enabled && input.cadence !== 'manual';
  const nextRunAt = enabled ? nextValuationRunAt(input.cadence) : null;
  const now = new Date();

  const [row] = await db
    .insert(valuationSchedules)
    .values({
      assetId,
      cadence: input.cadence,
      enabled,
      nextRunAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: valuationSchedules.assetId,
      set: {
        cadence: input.cadence,
        enabled,
        nextRunAt,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error('Unable to upsert valuation schedule.');
  return mapSchedule(row);
}

export async function getValuationAnalytics(
  db: Database,
  assetId: string,
): Promise<ValuationAnalytics> {
  const snapshots = await listValuationSnapshots(db, assetId);
  const reports = await listValuationReports(db, assetId);
  const latestReady = reports.find(
    (report) => report.status === 'ready' || report.status === 'adopted',
  );
  const annualizedDepreciationRate = calculateAnnualizedDepreciationRate(
    snapshots.map((snapshot) => ({
      valuedOn: snapshot.valuedOn,
      valueMinor: snapshot.valueMinor,
    })),
  );

  const notes: string[] = [];
  if (snapshots.length < 2) {
    notes.push('至少需要两次已采用估值快照，才能计算观察到的年化贬值率。');
  } else if (annualizedDepreciationRate === null) {
    notes.push('快照时间跨度不足 30 天，暂不计算年化贬值率。');
  }
  if ((latestReady?.forecasts.length ?? 0) === 0) {
    notes.push('尚无 AI 分段预测；确认估值后仍可查看历史快照。');
  }

  return {
    snapshots,
    annualizedDepreciationRate,
    latestForecasts: latestReady?.forecasts ?? [],
    notes,
  };
}

export async function listDueValuationSchedules(
  db: Database,
  limit: number,
): Promise<ValuationSchedule[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(valuationSchedules)
    .where(
      and(eq(valuationSchedules.enabled, true), lte(valuationSchedules.nextRunAt, now)),
    )
    .orderBy(valuationSchedules.nextRunAt)
    .limit(limit);
  return rows.map(mapSchedule);
}

export async function markScheduleRun(
  db: Database,
  assetId: string,
  reportId: string,
  cadence: ValuationSchedule['cadence'],
): Promise<void> {
  const now = new Date();
  await db
    .update(valuationSchedules)
    .set({
      lastRunAt: now,
      lastReportId: reportId,
      nextRunAt: nextValuationRunAt(cadence, now),
      updatedAt: now,
    })
    .where(eq(valuationSchedules.assetId, assetId));
}
