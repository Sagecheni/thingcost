import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import Decimal from 'decimal.js';

import type { Dashboard, RecentActivity } from '@thingcost/contracts';
import {
  appSettings,
  assets,
  assetStatuses,
  categories,
  conditionEvents,
  financialEvents,
  lifecycleEvents,
  loans,
  repairs,
  reminderOccurrences,
  reminders,
  valuationSnapshots,
  type Database,
} from '@thingcost/database';
import {
  addCalendarDays,
  calculatePortfolioSnapshot,
  calculatePortfolioTrend,
  type PortfolioAssetInput,
} from '@thingcost/domain';

import { currentDateInTimeZone } from '../lib/dates.js';

const conditionLabels = {
  new: '全新',
  like_new: '近新',
  good: '良好',
  fair: '一般',
  poor: '较差',
} as const;

export async function getDashboard(db: Database, periodDays: number): Promise<Dashboard> {
  const [settings] = await db
    .select({
      timeZone: appSettings.timeZone,
      baseCurrency: appSettings.baseCurrency,
    })
    .from(appSettings)
    .limit(1);

  if (!settings) {
    throw new Error('Chronicle has not been initialized.');
  }

  const today = currentDateInTimeZone(settings.timeZone);
  const periodStart = addCalendarDays(today, -periodDays + 1);
  const [assetRows, lifecycleRows, financialRows, upcomingReminderRows, valuationRows] =
    await Promise.all([
      db
        .select({
          id: assets.id,
          name: assets.name,
          acquisitionDate: assets.acquisitionDate,
          costKnowledge: assets.costKnowledge,
          categoryId: categories.id,
          categoryName: categories.name,
          categoryColor: categories.color,
          currentStatusName: assetStatuses.name,
        })
        .from(assets)
        .innerJoin(categories, eq(assets.categoryId, categories.id))
        .innerJoin(assetStatuses, eq(assets.currentStatusId, assetStatuses.id))
        .where(isNull(assets.deletedAt)),
      db
        .select({
          id: lifecycleEvents.id,
          assetId: lifecycleEvents.assetId,
          effectiveDate: lifecycleEvents.effectiveDate,
          createdAt: lifecycleEvents.createdAt,
          statusCode: assetStatuses.code,
          statusName: assetStatuses.name,
          countsTowardService: assetStatuses.countsTowardService,
          ownershipState: assetStatuses.ownershipState,
        })
        .from(lifecycleEvents)
        .innerJoin(assetStatuses, eq(lifecycleEvents.statusId, assetStatuses.id))
        .innerJoin(assets, eq(lifecycleEvents.assetId, assets.id))
        .where(and(isNull(assets.deletedAt), isNull(lifecycleEvents.voidedAt)))
        .orderBy(asc(lifecycleEvents.effectiveDate), asc(lifecycleEvents.createdAt)),
      db
        .select({
          id: financialEvents.id,
          assetId: financialEvents.assetId,
          type: financialEvents.type,
          direction: financialEvents.direction,
          baseAmountMinor: financialEvents.baseAmountMinor,
          includeInNetCost: financialEvents.includeInNetCost,
          occurredOn: financialEvents.occurredOn,
          note: financialEvents.note,
          createdAt: financialEvents.createdAt,
        })
        .from(financialEvents)
        .innerJoin(assets, eq(financialEvents.assetId, assets.id))
        .where(and(isNull(financialEvents.voidedAt), isNull(assets.deletedAt))),
      db
        .select({
          id: reminderOccurrences.id,
          reminderId: reminders.id,
          title: reminders.title,
          assetId: assets.id,
          assetName: assets.name,
          dueAt: reminderOccurrences.dueAt,
          timeZone: reminders.timeZone,
          taskMode: reminders.taskMode,
        })
        .from(reminderOccurrences)
        .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
        .leftJoin(assets, and(eq(reminders.assetId, assets.id), isNull(assets.deletedAt)))
        .where(
          and(
            eq(reminderOccurrences.status, 'pending'),
            eq(reminders.status, 'active'),
            gte(reminderOccurrences.dueAt, new Date()),
            lte(reminderOccurrences.dueAt, new Date(Date.now() + 90 * 86_400_000)),
          ),
        )
        .orderBy(asc(reminderOccurrences.dueAt))
        .limit(8),
      db
        .select({
          assetId: valuationSnapshots.assetId,
          currency: valuationSnapshots.currency,
          valueMinor: valuationSnapshots.valueMinor,
          valuedOn: valuationSnapshots.valuedOn,
          createdAt: valuationSnapshots.createdAt,
        })
        .from(valuationSnapshots)
        .innerJoin(assets, eq(valuationSnapshots.assetId, assets.id))
        .innerJoin(assetStatuses, eq(assets.currentStatusId, assetStatuses.id))
        .where(
          and(
            isNull(assets.deletedAt),
            eq(assetStatuses.ownershipState, 'held'),
            eq(valuationSnapshots.currency, settings.baseCurrency),
          ),
        )
        .orderBy(
          asc(valuationSnapshots.assetId),
          desc(valuationSnapshots.valuedOn),
          desc(valuationSnapshots.createdAt),
        ),
    ]);

  const lifecycleByAsset = new Map<string, typeof lifecycleRows>();
  const financialByAsset = new Map<string, typeof financialRows>();

  for (const event of lifecycleRows) {
    const existing = lifecycleByAsset.get(event.assetId) ?? [];
    existing.push(event);
    lifecycleByAsset.set(event.assetId, existing);
  }

  for (const event of financialRows) {
    const existing = financialByAsset.get(event.assetId) ?? [];
    existing.push(event);
    financialByAsset.set(event.assetId, existing);
  }

  const portfolioAssets: PortfolioAssetInput[] = assetRows.map((asset) => ({
    id: asset.id,
    acquisitionDate: asset.acquisitionDate,
    costKnown: asset.costKnowledge !== 'unknown',
    categoryId: asset.categoryId,
    lifecycleEvents: (lifecycleByAsset.get(asset.id) ?? []).map((event) => ({
      effectiveDate: event.effectiveDate,
      countsTowardService: event.countsTowardService,
      endsOwnership: event.ownershipState === 'disposed',
      statusCode: event.statusCode,
    })),
    financialEvents: (financialByAsset.get(asset.id) ?? []).map((event) => ({
      occurredOn: event.occurredOn,
      direction: event.direction,
      baseAmountMinor: event.baseAmountMinor,
      includeInNetCost: event.includeInNetCost,
    })),
  }));
  const current = calculatePortfolioSnapshot(portfolioAssets, today);
  const trend = calculatePortfolioTrend(portfolioAssets, today, periodDays);
  const categoryMetadata = new Map(
    assetRows.map((asset) => [
      asset.categoryId,
      { name: asset.categoryName, color: asset.categoryColor },
    ]),
  );
  const categoryTotals = new Map<
    string,
    {
      itemCount: number;
      netCostMinor: bigint;
      dailyCostMinor: Decimal;
      holdingDailyCostMinor: Decimal;
    }
  >();

  for (const asset of current.assets) {
    if (!asset.isHeld) {
      continue;
    }

    const total = categoryTotals.get(asset.categoryId) ?? {
      itemCount: 0,
      netCostMinor: 0n,
      dailyCostMinor: new Decimal(0),
      holdingDailyCostMinor: new Decimal(0),
    };
    total.itemCount += 1;
    total.netCostMinor += asset.netCostMinor ?? 0n;

    if (asset.isInServicePortfolio && asset.netDailyCostMinor !== null) {
      total.dailyCostMinor = total.dailyCostMinor.plus(asset.netDailyCostMinor);
    }

    if (asset.holdingDailyCostMinor !== null) {
      total.holdingDailyCostMinor = total.holdingDailyCostMinor.plus(
        asset.holdingDailyCostMinor,
      );
    }

    categoryTotals.set(asset.categoryId, total);
  }

  const latestValuationByAsset = new Map<string, bigint>();
  for (const valuation of valuationRows) {
    if (!latestValuationByAsset.has(valuation.assetId)) {
      latestValuationByAsset.set(valuation.assetId, valuation.valueMinor);
    }
  }
  let adoptedValuationMinor = 0n;
  let valuedNetInvestmentMinor = 0n;
  for (const asset of current.assets) {
    if (!asset.isHeld) continue;
    const value = latestValuationByAsset.get(asset.id);
    if (value === undefined) continue;
    adoptedValuationMinor += value;
    valuedNetInvestmentMinor += asset.netCostMinor ?? 0n;
  }
  const valuedItemCount = [...latestValuationByAsset.keys()].filter((assetId) =>
    current.assets.some((asset) => asset.id === assetId && asset.isHeld),
  ).length;

  let periodSpendingMinor = 0n;
  let periodInflowMinor = 0n;
  for (const event of financialRows) {
    if (event.occurredOn < periodStart || event.occurredOn > today) {
      continue;
    }

    if (event.direction === 'outflow') {
      periodSpendingMinor += event.baseAmountMinor;
    } else {
      periodInflowMinor += event.baseAmountMinor;
    }
  }
  const periodNetSpendingMinor = periodSpendingMinor - periodInflowMinor;

  const recentActivity = await loadRecentActivity(db);
  const currentStatusCounts = current.assets.reduce<Record<string, number>>(
    (counts, asset) => {
      counts[asset.statusCode] = (counts[asset.statusCode] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const assetMetadata = new Map(assetRows.map((asset) => [asset.id, asset]));
  const heldAssetInsights = current.assets
    .filter((asset) => asset.isHeld)
    .map((asset) => {
      const metadata = assetMetadata.get(asset.id);
      return {
        assetId: asset.id,
        name: metadata?.name ?? '未命名物品',
        categoryName: metadata?.categoryName ?? '未知分类',
        categoryColor: metadata?.categoryColor ?? null,
        statusCode: asset.statusCode,
        statusName: metadata?.currentStatusName ?? asset.statusCode,
        netCostMinor: asset.netCostMinor?.toString() ?? null,
        holdingDailyCostMinor: asset.holdingDailyCostMinor,
        serviceDailyCostMinor: asset.netDailyCostMinor,
        holdingDays: asset.holdingDays,
        serviceDays: asset.serviceDays,
      };
    });

  return {
    asOfDate: today,
    baseCurrency: settings.baseCurrency,
    periodDays,
    currentDailyCostMinor: current.currentDailyCostMinor,
    currentHoldingDailyCostMinor: current.currentHoldingDailyCostMinor,
    currentNetInvestmentMinor: current.currentNetInvestmentMinor.toString(),
    adoptedValuationMinor: valuedItemCount > 0 ? adoptedValuationMinor.toString() : null,
    valuedNetInvestmentMinor:
      valuedItemCount > 0 ? valuedNetInvestmentMinor.toString() : null,
    valuationDeltaMinor:
      valuedItemCount > 0
        ? (adoptedValuationMinor - valuedNetInvestmentMinor).toString()
        : null,
    valuedItemCount,
    valuationCoveragePercent:
      current.heldItemCount === 0
        ? 0
        : Math.round((valuedItemCount / current.heldItemCount) * 100),
    periodSpendingMinor: periodSpendingMinor.toString(),
    periodInflowMinor: periodInflowMinor.toString(),
    periodNetSpendingMinor: periodNetSpendingMinor.toString(),
    heldItemCount: current.heldItemCount,
    serviceItemCount: current.serviceItemCount,
    totalItemCount: current.assets.length,
    unknownCostCount: current.unknownCostCount,
    dataCompletenessPercent:
      current.assets.length === 0
        ? 100
        : Math.round(
            ((current.assets.length - current.unknownCostCount) / current.assets.length) *
              100,
          ),
    idleCount: currentStatusCounts.idle ?? 0,
    loanedCount: currentStatusCounts.lent ?? 0,
    repairCount: currentStatusCounts.in_repair ?? 0,
    retiredCount: currentStatusCounts.retired ?? 0,
    categories: [...categoryTotals.entries()]
      .map(([categoryId, totals]) => ({
        categoryId,
        name: categoryMetadata.get(categoryId)?.name ?? '未知分类',
        color: categoryMetadata.get(categoryId)?.color ?? null,
        itemCount: totals.itemCount,
        netCostMinor: totals.netCostMinor.toString(),
        dailyCostMinor: totals.dailyCostMinor.toDecimalPlaces(8).toString(),
        holdingDailyCostMinor: totals.holdingDailyCostMinor.toDecimalPlaces(8).toString(),
      }))
      .sort((left, right) => Number(right.netCostMinor) - Number(left.netCostMinor)),
    trend: trend.map((point) => ({
      date: point.asOfDate,
      dailyCostMinor: point.currentDailyCostMinor,
      holdingDailyCostMinor: point.currentHoldingDailyCostMinor,
      netInvestmentMinor: point.currentNetInvestmentMinor.toString(),
      activeItemCount: point.serviceItemCount,
      heldItemCount: point.heldItemCount,
    })),
    assetRankings: {
      highestHoldingDailyCost: heldAssetInsights
        .filter((asset) => asset.holdingDailyCostMinor !== null)
        .sort((left, right) =>
          new Decimal(right.holdingDailyCostMinor ?? 0).comparedTo(
            left.holdingDailyCostMinor ?? 0,
          ),
        )
        .slice(0, 5),
      longestHeld: [...heldAssetInsights]
        .sort(
          (left, right) =>
            right.holdingDays - left.holdingDays || left.name.localeCompare(right.name),
        )
        .slice(0, 5),
    },
    recentActivity,
    upcomingReminders: upcomingReminderRows.map((reminder) => ({
      id: reminder.id,
      reminderId: reminder.reminderId,
      title: reminder.title,
      assetId: reminder.assetId,
      assetName: reminder.assetName,
      dueAt: reminder.dueAt.toISOString(),
      timeZone: reminder.timeZone,
      taskMode: reminder.taskMode,
    })),
  };
}

async function loadRecentActivity(db: Database): Promise<RecentActivity[]> {
  const [assetRows, lifecycleRows, financialRows, conditionRows, loanRows, repairRows] =
    await Promise.all([
      db
        .select({
          id: assets.id,
          name: assets.name,
          acquisitionDate: assets.acquisitionDate,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .where(isNull(assets.deletedAt)),
      db
        .select({
          id: lifecycleEvents.id,
          assetId: assets.id,
          assetName: assets.name,
          statusName: assetStatuses.name,
          effectiveDate: lifecycleEvents.effectiveDate,
          note: lifecycleEvents.note,
          createdAt: lifecycleEvents.createdAt,
        })
        .from(lifecycleEvents)
        .innerJoin(assets, eq(lifecycleEvents.assetId, assets.id))
        .innerJoin(assetStatuses, eq(lifecycleEvents.statusId, assetStatuses.id))
        .where(and(isNull(assets.deletedAt), isNull(lifecycleEvents.voidedAt))),
      db
        .select({
          id: financialEvents.id,
          assetId: assets.id,
          assetName: assets.name,
          type: financialEvents.type,
          occurredOn: financialEvents.occurredOn,
          note: financialEvents.note,
          createdAt: financialEvents.createdAt,
        })
        .from(financialEvents)
        .innerJoin(assets, eq(financialEvents.assetId, assets.id))
        .where(and(isNull(financialEvents.voidedAt), isNull(assets.deletedAt))),
      db
        .select({
          id: conditionEvents.id,
          assetId: assets.id,
          assetName: assets.name,
          grade: conditionEvents.grade,
          observedOn: conditionEvents.observedOn,
          note: conditionEvents.note,
          createdAt: conditionEvents.createdAt,
        })
        .from(conditionEvents)
        .innerJoin(assets, eq(conditionEvents.assetId, assets.id))
        .where(isNull(assets.deletedAt)),
      db
        .select({
          id: loans.id,
          assetId: assets.id,
          assetName: assets.name,
          borrower: loans.borrower,
          lentOn: loans.lentOn,
          returnedOn: loans.returnedOn,
          note: loans.note,
          returnNote: loans.returnNote,
          createdAt: loans.createdAt,
          updatedAt: loans.updatedAt,
        })
        .from(loans)
        .innerJoin(assets, eq(loans.assetId, assets.id))
        .where(isNull(assets.deletedAt)),
      db
        .select({
          id: repairs.id,
          assetId: assets.id,
          assetName: assets.name,
          issue: repairs.issue,
          sentOn: repairs.sentOn,
          completedOn: repairs.completedOn,
          createdAt: repairs.createdAt,
          updatedAt: repairs.updatedAt,
        })
        .from(repairs)
        .innerJoin(assets, eq(repairs.assetId, assets.id))
        .where(isNull(assets.deletedAt)),
    ]);

  const financialTitles = {
    acquisition: '记录取得成本',
    refund: '记录退款',
    shipping: '记录运费',
    tax: '记录税费',
    repair: '记录维修支出',
    upgrade: '记录升级支出',
    accessory: '记录配件支出',
    fee: '记录手续费',
    disposal_fee: '记录处置费用',
    sale_proceeds: '记录卖出回款',
    other: '记录其他资金事件',
  } as const;
  const activity: RecentActivity[] = [
    ...assetRows.map((asset) => ({
      id: `asset:${asset.id}`,
      type: 'asset_created' as const,
      assetId: asset.id,
      assetName: asset.name,
      title: '建立物品档案',
      detail: null,
      occurredOn: asset.acquisitionDate,
      createdAt: asset.createdAt.toISOString(),
    })),
    ...lifecycleRows.map((event) => ({
      id: `lifecycle:${event.id}`,
      type: 'lifecycle_changed' as const,
      assetId: event.assetId,
      assetName: event.assetName,
      title: `状态变为${event.statusName}`,
      detail: event.note,
      occurredOn: event.effectiveDate,
      createdAt: event.createdAt.toISOString(),
    })),
    ...financialRows.map((event) => ({
      id: `financial:${event.id}`,
      type: 'financial_recorded' as const,
      assetId: event.assetId,
      assetName: event.assetName,
      title: financialTitles[event.type],
      detail: event.note,
      occurredOn: event.occurredOn,
      createdAt: event.createdAt.toISOString(),
    })),
    ...conditionRows.map((event) => ({
      id: `condition:${event.id}`,
      type: 'condition_recorded' as const,
      assetId: event.assetId,
      assetName: event.assetName,
      title: `成色更新为${conditionLabels[event.grade]}`,
      detail: event.note,
      occurredOn: event.observedOn,
      createdAt: event.createdAt.toISOString(),
    })),
    ...loanRows.flatMap<RecentActivity>((loan) => [
      {
        id: `loan:start:${loan.id}`,
        type: 'loan_started',
        assetId: loan.assetId,
        assetName: loan.assetName,
        title: `借给 ${loan.borrower}`,
        detail: loan.note,
        occurredOn: loan.lentOn,
        createdAt: loan.createdAt.toISOString(),
      },
      ...(loan.returnedOn
        ? [
            {
              id: `loan:return:${loan.id}`,
              type: 'loan_returned' as const,
              assetId: loan.assetId,
              assetName: loan.assetName,
              title: '完成归还',
              detail: loan.returnNote,
              occurredOn: loan.returnedOn,
              createdAt: loan.updatedAt.toISOString(),
            },
          ]
        : []),
    ]),
    ...repairRows.flatMap<RecentActivity>((repair) => [
      {
        id: `repair:start:${repair.id}`,
        type: 'repair_started',
        assetId: repair.assetId,
        assetName: repair.assetName,
        title: '开始维修',
        detail: repair.issue,
        occurredOn: repair.sentOn,
        createdAt: repair.createdAt.toISOString(),
      },
      ...(repair.completedOn
        ? [
            {
              id: `repair:complete:${repair.id}`,
              type: 'repair_completed' as const,
              assetId: repair.assetId,
              assetName: repair.assetName,
              title: '维修完成',
              detail: repair.issue,
              occurredOn: repair.completedOn,
              createdAt: repair.updatedAt.toISOString(),
            },
          ]
        : []),
    ]),
  ];

  return activity
    .sort((left, right) => {
      const byTime = right.createdAt.localeCompare(left.createdAt);
      return byTime === 0 ? left.id.localeCompare(right.id) : byTime;
    })
    .slice(0, 24);
}
