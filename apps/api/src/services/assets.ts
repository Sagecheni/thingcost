import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import Decimal from 'decimal.js';

import type {
  AssetDetail,
  AssetListQuery,
  AssetSummary,
  ConditionEvent,
} from '@thingcost/contracts';
import {
  appSettings,
  assetAttachments,
  assetRelationships,
  assets,
  assetStatuses,
  assetTags,
  categories,
  conditionDefects,
  conditionEvents,
  financialEvents,
  lifecycleEvents,
  loans,
  purchaseOrderItems,
  purchaseOrders,
  repairs,
  tags,
  type Database,
} from '@thingcost/database';
import { calculateAssetMetrics } from '@thingcost/domain';

import { currentDateInTimeZone } from '../lib/dates.js';
import { mapAssetAttachment } from './attachments.js';

async function getCalculationDate(db: Database): Promise<string> {
  const [settings] = await db
    .select({ timeZone: appSettings.timeZone })
    .from(appSettings)
    .limit(1);

  if (!settings) {
    throw new Error('Chronicle has not been initialized.');
  }

  return currentDateInTimeZone(settings.timeZone);
}

async function loadAssetBase(db: Database, assetId: string) {
  const [row] = await db
    .select({
      id: assets.id,
      name: assets.name,
      description: assets.description,
      acquisitionType: assets.acquisitionType,
      acquisitionDate: assets.acquisitionDate,
      costKnowledge: assets.costKnowledge,
      priceCurrency: assets.priceCurrency,
      originalPriceMinor: assets.originalPriceMinor,
      discountMinor: assets.discountMinor,
      brand: assets.brand,
      model: assets.model,
      serialNumber: assets.serialNumber,
      purchaseChannel: assets.purchaseChannel,
      orderNumber: assets.orderNumber,
      warrantyStartDate: assets.warrantyStartDate,
      warrantyEndDate: assets.warrantyEndDate,
      extendedWarrantyEndDate: assets.extendedWarrantyEndDate,
      extendedWarrantyProvider: assets.extendedWarrantyProvider,
      createdAt: assets.createdAt,
      updatedAt: assets.updatedAt,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      categoryIsSystem: categories.isSystem,
      categorySortOrder: categories.sortOrder,
      statusId: assetStatuses.id,
      statusCode: assetStatuses.code,
      statusName: assetStatuses.name,
      statusCountsTowardService: assetStatuses.countsTowardService,
      statusOwnershipState: assetStatuses.ownershipState,
      statusIsSystem: assetStatuses.isSystem,
      statusSortOrder: assetStatuses.sortOrder,
    })
    .from(assets)
    .innerJoin(categories, eq(assets.categoryId, categories.id))
    .innerJoin(assetStatuses, eq(assets.currentStatusId, assetStatuses.id))
    .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
    .limit(1);

  return row ?? null;
}

export async function getAssetDetail(
  db: Database,
  assetId: string,
): Promise<AssetDetail | null> {
  const row = await loadAssetBase(db, assetId);

  if (!row) {
    return null;
  }

  const [
    asOfDate,
    lifecycleRows,
    financialRows,
    conditionRows,
    tagRows,
    loanRows,
    repairRows,
    attachmentRows,
    relationshipRows,
    purchaseOrderRows,
  ] = await Promise.all([
    getCalculationDate(db),
    db
      .select({
        id: lifecycleEvents.id,
        effectiveDate: lifecycleEvents.effectiveDate,
        note: lifecycleEvents.note,
        createdAt: lifecycleEvents.createdAt,
        voidedAt: lifecycleEvents.voidedAt,
        voidReason: lifecycleEvents.voidReason,
        correctionOfId: lifecycleEvents.correctionOfId,
        statusId: assetStatuses.id,
        statusCode: assetStatuses.code,
        statusName: assetStatuses.name,
        statusCountsTowardService: assetStatuses.countsTowardService,
        statusOwnershipState: assetStatuses.ownershipState,
        statusIsSystem: assetStatuses.isSystem,
        statusSortOrder: assetStatuses.sortOrder,
      })
      .from(lifecycleEvents)
      .innerJoin(assetStatuses, eq(lifecycleEvents.statusId, assetStatuses.id))
      .where(eq(lifecycleEvents.assetId, assetId))
      .orderBy(asc(lifecycleEvents.effectiveDate), asc(lifecycleEvents.createdAt)),
    db
      .select()
      .from(financialEvents)
      .where(eq(financialEvents.assetId, assetId))
      .orderBy(desc(financialEvents.occurredOn), desc(financialEvents.createdAt)),
    db
      .select()
      .from(conditionEvents)
      .where(eq(conditionEvents.assetId, assetId))
      .orderBy(desc(conditionEvents.observedOn), desc(conditionEvents.createdAt)),
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(assetTags)
      .innerJoin(tags, eq(assetTags.tagId, tags.id))
      .where(and(eq(assetTags.assetId, assetId), isNull(tags.deletedAt)))
      .orderBy(asc(tags.name)),
    db
      .select()
      .from(loans)
      .where(eq(loans.assetId, assetId))
      .orderBy(desc(loans.lentOn), desc(loans.createdAt)),
    db
      .select({
        id: repairs.id,
        issue: repairs.issue,
        provider: repairs.provider,
        sentOn: repairs.sentOn,
        completedOn: repairs.completedOn,
        costFinancialEventId: repairs.costFinancialEventId,
        note: repairs.note,
        completionNote: repairs.completionNote,
        createdAt: repairs.createdAt,
        updatedAt: repairs.updatedAt,
        costAmountMinor: financialEvents.amountMinor,
        currency: financialEvents.currency,
        baseCostAmountMinor: financialEvents.baseAmountMinor,
        baseCurrency: financialEvents.baseCurrency,
        exchangeRate: financialEvents.exchangeRate,
        exchangeRateSource: financialEvents.exchangeRateSource,
        exchangeRateDate: financialEvents.exchangeRateDate,
        exchangeRateFallback: financialEvents.exchangeRateFallback,
        includeInNetCost: financialEvents.includeInNetCost,
      })
      .from(repairs)
      .leftJoin(
        financialEvents,
        and(
          eq(repairs.costFinancialEventId, financialEvents.id),
          isNull(financialEvents.voidedAt),
        ),
      )
      .where(eq(repairs.assetId, assetId))
      .orderBy(desc(repairs.sentOn), desc(repairs.createdAt)),
    db
      .select()
      .from(assetAttachments)
      .where(eq(assetAttachments.assetId, assetId))
      .orderBy(
        desc(assetAttachments.isCover),
        asc(assetAttachments.sortOrder),
        asc(assetAttachments.createdAt),
      ),
    db
      .select()
      .from(assetRelationships)
      .where(
        or(
          eq(assetRelationships.sourceAssetId, assetId),
          eq(assetRelationships.targetAssetId, assetId),
        ),
      )
      .orderBy(asc(assetRelationships.createdAt)),
    db
      .select({
        id: purchaseOrders.id,
        merchant: purchaseOrders.merchant,
        orderNumber: purchaseOrders.orderNumber,
        orderedOn: purchaseOrders.orderedOn,
        currency: purchaseOrders.currency,
        totalPaidMinor: purchaseOrders.totalPaidMinor,
      })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrderItems.orderId, purchaseOrders.id))
      .where(eq(purchaseOrderItems.assetId, assetId))
      .limit(1),
  ]);

  const relatedAssetIds = relationshipRows.map((relationship) =>
    relationship.sourceAssetId === assetId
      ? relationship.targetAssetId
      : relationship.sourceAssetId,
  );
  const [relatedAssetRows, relatedCoverRows] = await Promise.all([
    relatedAssetIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ id: assets.id, name: assets.name })
          .from(assets)
          .where(and(inArray(assets.id, relatedAssetIds), isNull(assets.deletedAt))),
    relatedAssetIds.length === 0
      ? Promise.resolve([])
      : db
          .select({ assetId: assetAttachments.assetId, id: assetAttachments.id })
          .from(assetAttachments)
          .where(
            and(
              inArray(assetAttachments.assetId, relatedAssetIds),
              eq(assetAttachments.isCover, true),
            ),
          ),
  ]);
  const relatedAssetsById = new Map(relatedAssetRows.map((asset) => [asset.id, asset]));
  const relatedCoversByAssetId = new Map(
    relatedCoverRows.map((attachment) => [attachment.assetId, attachment.id]),
  );

  const defectRows =
    conditionRows.length === 0
      ? []
      : await db
          .select()
          .from(conditionDefects)
          .where(
            inArray(
              conditionDefects.conditionEventId,
              conditionRows.map((event) => event.id),
            ),
          )
          .orderBy(asc(conditionDefects.id));

  const defectsByEvent = new Map<string, typeof defectRows>();

  for (const defect of defectRows) {
    const existing = defectsByEvent.get(defect.conditionEventId) ?? [];
    existing.push(defect);
    defectsByEvent.set(defect.conditionEventId, existing);
  }

  const mappedConditionEvents: ConditionEvent[] = conditionRows.map((event) => ({
    id: event.id,
    grade: event.grade,
    observedOn: event.observedOn,
    defects: (defectsByEvent.get(event.id) ?? []).map((defect) => ({
      id: defect.id,
      type: defect.type,
      description: defect.description,
    })),
    note: event.note,
    createdAt: event.createdAt.toISOString(),
  }));

  const mappedAttachments = attachmentRows.map(mapAssetAttachment);
  const activeLifecycleRows = lifecycleRows.filter((event) => event.voidedAt === null);
  const activeFinancialRows = financialRows.filter((event) => event.voidedAt === null);
  const hasKnownCost = row.costKnowledge !== 'unknown';
  const netCostMinor = activeFinancialRows.reduce((total, event) => {
    if (!event.includeInNetCost) {
      return total;
    }

    return event.direction === 'outflow'
      ? total + event.baseAmountMinor
      : total - event.baseAmountMinor;
  }, 0n);

  const calculatedMetrics = calculateAssetMetrics({
    acquisitionDate: row.acquisitionDate,
    asOfDate,
    netCostMinor,
    lifecycleEvents: activeLifecycleRows.map((event) => ({
      effectiveDate: event.effectiveDate,
      countsTowardService: event.statusCountsTowardService,
      endsOwnership: event.statusOwnershipState === 'disposed',
    })),
  });

  const summary: AssetSummary = {
    id: row.id,
    name: row.name,
    description: row.description,
    category: {
      id: row.categoryId,
      name: row.categoryName,
      color: row.categoryColor,
      icon: row.categoryIcon,
      isSystem: row.categoryIsSystem,
      sortOrder: row.categorySortOrder,
    },
    acquisitionType: row.acquisitionType,
    acquisitionDate: row.acquisitionDate,
    costKnowledge: row.costKnowledge,
    priceCurrency: row.priceCurrency,
    originalPriceMinor: row.originalPriceMinor?.toString() ?? null,
    discountMinor: row.discountMinor?.toString() ?? null,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serialNumber,
    purchaseChannel: row.purchaseChannel,
    orderNumber: row.orderNumber,
    warrantyStartDate: row.warrantyStartDate,
    warrantyEndDate: row.warrantyEndDate,
    extendedWarrantyEndDate: row.extendedWarrantyEndDate,
    extendedWarrantyProvider: row.extendedWarrantyProvider,
    currentStatus: {
      id: row.statusId,
      code: row.statusCode,
      name: row.statusName,
      countsTowardService: row.statusCountsTowardService,
      ownershipState: row.statusOwnershipState,
      isSystem: row.statusIsSystem,
      sortOrder: row.statusSortOrder,
    },
    currentCondition: mappedConditionEvents[0] ?? null,
    tags: tagRows,
    hasOpenLoan: loanRows.some((loan) => loan.returnedOn === null),
    hasOpenRepair: repairRows.some((repair) => repair.completedOn === null),
    coverAttachment: mappedAttachments.find((attachment) => attachment.isCover) ?? null,
    metrics: {
      holdingDays: calculatedMetrics.holdingDays,
      serviceDays: calculatedMetrics.serviceDays,
      netCostMinor: hasKnownCost ? calculatedMetrics.netCostMinor.toString() : null,
      netDailyCostMinor: hasKnownCost ? calculatedMetrics.netDailyCostMinor : null,
      currentlyInPortfolio: calculatedMetrics.currentlyInPortfolio,
      disposedOn: calculatedMetrics.disposedOn,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  return {
    ...summary,
    lifecycleEvents: lifecycleRows.map((event) => ({
      id: event.id,
      status: {
        id: event.statusId,
        code: event.statusCode,
        name: event.statusName,
        countsTowardService: event.statusCountsTowardService,
        ownershipState: event.statusOwnershipState,
        isSystem: event.statusIsSystem,
        sortOrder: event.statusSortOrder,
      },
      effectiveDate: event.effectiveDate,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
      voidedAt: event.voidedAt?.toISOString() ?? null,
      voidReason: event.voidReason,
      correctionOfId: event.correctionOfId,
    })),
    financialEvents: financialRows.map((event) => ({
      id: event.id,
      type: event.type,
      direction: event.direction,
      amountMinor: event.amountMinor.toString(),
      currency: event.currency,
      baseAmountMinor: event.baseAmountMinor.toString(),
      baseCurrency: event.baseCurrency,
      exchangeRate: new Decimal(event.exchangeRate).toString(),
      exchangeRateSource: event.exchangeRateSource as 'manual' | 'frankfurter' | 'legacy',
      exchangeRateDate: event.exchangeRateDate,
      exchangeRateFallback: event.exchangeRateFallback,
      occurredOn: event.occurredOn,
      includeInNetCost: event.includeInNetCost,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
      voidedAt: event.voidedAt?.toISOString() ?? null,
      voidReason: event.voidReason,
      correctionOfId: event.correctionOfId,
    })),
    conditionEvents: mappedConditionEvents,
    loans: loanRows.map((loan) => ({
      id: loan.id,
      borrower: loan.borrower,
      lentOn: loan.lentOn,
      dueOn: loan.dueOn,
      returnedOn: loan.returnedOn,
      note: loan.note,
      returnNote: loan.returnNote,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
    })),
    attachments: mappedAttachments,
    purchaseOrder: purchaseOrderRows[0]
      ? {
          ...purchaseOrderRows[0],
          totalPaidMinor: purchaseOrderRows[0].totalPaidMinor.toString(),
        }
      : null,
    relationships: relationshipRows.flatMap((relationship) => {
      const isSource = relationship.sourceAssetId === assetId;
      const relatedAssetId = isSource
        ? relationship.targetAssetId
        : relationship.sourceAssetId;
      const relatedAsset = relatedAssetsById.get(relatedAssetId);
      if (!relatedAsset) return [];
      const coverId = relatedCoversByAssetId.get(relatedAssetId);
      return [
        {
          id: relationship.id,
          type: relationship.type,
          role: isSource ? ('source' as const) : ('target' as const),
          relatedAsset: {
            id: relatedAsset.id,
            name: relatedAsset.name,
            coverThumbnailUrl: coverId
              ? `/api/v1/assets/${relatedAsset.id}/attachments/${coverId}/thumbnail`
              : null,
          },
          note: relationship.note,
          createdAt: relationship.createdAt.toISOString(),
        },
      ];
    }),
    repairs: repairRows.map((repair) => ({
      id: repair.id,
      issue: repair.issue,
      provider: repair.provider,
      sentOn: repair.sentOn,
      completedOn: repair.completedOn,
      costFinancialEventId: repair.costFinancialEventId,
      costAmountMinor: repair.costAmountMinor?.toString() ?? null,
      currency: repair.currency,
      baseCostAmountMinor: repair.baseCostAmountMinor?.toString() ?? null,
      baseCurrency: repair.baseCurrency,
      exchangeRate: repair.exchangeRate
        ? new Decimal(repair.exchangeRate).toString()
        : null,
      exchangeRateSource: repair.exchangeRateSource as
        'manual' | 'frankfurter' | 'legacy' | null,
      exchangeRateDate: repair.exchangeRateDate,
      exchangeRateFallback: repair.exchangeRateFallback,
      includeInNetCost: repair.includeInNetCost,
      note: repair.note,
      completionNote: repair.completionNote,
      createdAt: repair.createdAt.toISOString(),
      updatedAt: repair.updatedAt.toISOString(),
    })),
  };
}

export async function listAssetSummaries(
  db: Database,
  query: AssetListQuery,
): Promise<AssetSummary[]> {
  const ids = await db
    .select({ id: assets.id })
    .from(assets)
    .where(isNull(assets.deletedAt))
    .orderBy(desc(assets.updatedAt));

  const details = await Promise.all(ids.map(({ id }) => getAssetDetail(db, id)));
  const normalizedQuery = query.q?.toLocaleLowerCase('zh-CN');
  const filtered = details.filter((detail): detail is AssetDetail => {
    if (!detail) {
      return false;
    }

    if (
      normalizedQuery &&
      ![
        detail.name,
        detail.brand,
        detail.model,
        detail.category.name,
        detail.currentStatus.name,
        ...detail.tags.map((tag) => tag.name),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    ) {
      return false;
    }

    if (query.categoryId && detail.category.id !== query.categoryId) {
      return false;
    }

    if (query.statusId && detail.currentStatus.id !== query.statusId) {
      return false;
    }

    if (query.tagId && !detail.tags.some((tag) => tag.id === query.tagId)) {
      return false;
    }

    if (query.conditionGrade && detail.currentCondition?.grade !== query.conditionGrade) {
      return false;
    }

    if (query.costKnowledge && detail.costKnowledge !== query.costKnowledge) {
      return false;
    }

    if (query.acquiredFrom && detail.acquisitionDate < query.acquiredFrom) {
      return false;
    }

    if (query.acquiredTo && detail.acquisitionDate > query.acquiredTo) {
      return false;
    }

    if (
      query.minNetCostMinor &&
      (detail.metrics.netCostMinor === null ||
        BigInt(detail.metrics.netCostMinor) < BigInt(query.minNetCostMinor))
    ) {
      return false;
    }

    if (
      query.maxNetCostMinor &&
      (detail.metrics.netCostMinor === null ||
        BigInt(detail.metrics.netCostMinor) > BigInt(query.maxNetCostMinor))
    ) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    switch (query.sort) {
      case 'acquired_desc':
        return right.acquisitionDate.localeCompare(left.acquisitionDate);
      case 'name_asc':
        return left.name.localeCompare(right.name, 'zh-CN');
      case 'daily_cost_desc':
        return (
          Number(right.metrics.netDailyCostMinor ?? Number.NEGATIVE_INFINITY) -
          Number(left.metrics.netDailyCostMinor ?? Number.NEGATIVE_INFINITY)
        );
      case 'net_cost_desc':
        return (
          Number(right.metrics.netCostMinor ?? Number.NEGATIVE_INFINITY) -
          Number(left.metrics.netCostMinor ?? Number.NEGATIVE_INFINITY)
        );
      case 'updated_desc':
        return right.updatedAt.localeCompare(left.updatedAt);
    }
  });
}
