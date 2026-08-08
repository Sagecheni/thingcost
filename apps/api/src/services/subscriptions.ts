import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type {
  CreateSubscriptionChargeInput,
  CreateSubscriptionInput,
  CreateSubscriptionPriceChangeInput,
  Subscription,
  SubscriptionCharge,
  SubscriptionDetail,
  SubscriptionActionInput,
  SubscriptionList,
  SubscriptionTag,
  SubscriptionAttachment,
  SubscriptionPriceChange,
  UpdateSubscriptionInput,
} from '@thingcost/contracts';
import {
  subscriptionAttachments,
  subscriptionCharges,
  subscriptionPriceChanges,
  subscriptionTags,
  subscriptions,
  tags,
  type Database,
} from '@thingcost/database';
import { calculateSubscriptionMetrics } from '@thingcost/domain';

export class SubscriptionServiceError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID_INPUT' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'SubscriptionServiceError';
  }
}

function mapSubscription(
  row: typeof subscriptions.$inferSelect,
  tagRows: SubscriptionTag[] = [],
): Subscription {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    vendor: row.vendor,
    categoryLabel: row.categoryLabel,
    status: row.status,
    billingCycle: row.billingCycle,
    customIntervalDays: row.customIntervalDays,
    currency: row.currency,
    amountMinor: row.amountMinor.toString(),
    discountMinor: row.discountMinor.toString(),
    discountEndsOn: row.discountEndsOn,
    autoRenew: row.autoRenew,
    seats: row.seats,
    startedOn: row.startedOn,
    trialEndsOn: row.trialEndsOn,
    nextBillingOn: row.nextBillingOn,
    cancelledOn: row.cancelledOn,
    expiresOn: row.expiresOn,
    accountHint: row.accountHint,
    passwordManagerUrl: row.passwordManagerUrl,
    notes: row.notes,
    tags: tagRows,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCharge(row: typeof subscriptionCharges.$inferSelect): SubscriptionCharge {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    kind: row.kind,
    status: row.status,
    currency: row.currency,
    amountMinor: row.amountMinor.toString(),
    occurredOn: row.occurredOn,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapSubscriptionAttachment(
  row: typeof subscriptionAttachments.$inferSelect,
): SubscriptionAttachment {
  const basePath = `/api/v1/subscriptions/${row.subscriptionId}/attachments/${row.id}`;
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    kind: row.kind,
    originalName: row.originalName,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    caption: row.caption,
    sortOrder: row.sortOrder,
    contentUrl: `${basePath}/content`,
    thumbnailUrl: row.thumbnailStorageKey ? `${basePath}/thumbnail` : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPriceChange(
  row: typeof subscriptionPriceChanges.$inferSelect,
): SubscriptionPriceChange {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    kind: row.kind,
    amountMinor: row.amountMinor.toString(),
    discountMinor: row.discountMinor.toString(),
    effectiveOn: row.effectiveOn,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function metricsFor(
  row: typeof subscriptions.$inferSelect,
  charges: Array<typeof subscriptionCharges.$inferSelect>,
) {
  const today = new Date().toISOString().slice(0, 10);
  const discountActive = row.discountEndsOn === null || row.discountEndsOn >= today;
  const metrics = calculateSubscriptionMetrics({
    amountMinor: row.amountMinor,
    discountMinor: discountActive ? row.discountMinor : 0n,
    billingCycle: row.billingCycle,
    customIntervalDays: row.customIntervalDays,
    status: row.status,
    charges: charges.map((charge) => ({
      kind: charge.kind,
      status: charge.status,
      amountMinor: charge.amountMinor,
    })),
  });
  return {
    projectedMonthlyMinor: metrics.projectedMonthlyMinor.toString(),
    projectedYearlyMinor: metrics.projectedYearlyMinor.toString(),
    actualSpendMinor: metrics.actualSpendMinor.toString(),
    plannedSpendMinor: metrics.plannedSpendMinor.toString(),
    failedChargeCount: metrics.failedChargeCount,
  };
}

async function tagsForSubscriptions(
  db: Database,
  subscriptionIds: string[],
): Promise<Map<string, SubscriptionTag[]>> {
  const result = new Map<string, SubscriptionTag[]>();
  if (subscriptionIds.length === 0) return result;
  const rows = await db
    .select({ subscriptionId: subscriptionTags.subscriptionId, tag: tags })
    .from(subscriptionTags)
    .innerJoin(tags, eq(subscriptionTags.tagId, tags.id))
    .where(inArray(subscriptionTags.subscriptionId, subscriptionIds));
  for (const row of rows) {
    const list = result.get(row.subscriptionId) ?? [];
    list.push(row.tag);
    result.set(row.subscriptionId, list);
  }
  return result;
}

async function syncSubscriptionTags(
  db: Database,
  subscriptionId: string,
  tagIds: string[] | undefined,
): Promise<void> {
  if (tagIds === undefined) return;
  const uniqueIds = [...new Set(tagIds)];
  const validTags = uniqueIds.length
    ? await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, uniqueIds))
    : [];
  if (validTags.length !== uniqueIds.length) {
    throw new SubscriptionServiceError('INVALID_INPUT', '一个或多个标签不存在');
  }
  await db
    .delete(subscriptionTags)
    .where(eq(subscriptionTags.subscriptionId, subscriptionId));
  if (uniqueIds.length > 0) {
    await db
      .insert(subscriptionTags)
      .values(uniqueIds.map((tagId) => ({ subscriptionId, tagId })));
  }
}

export async function listSubscriptions(db: Database): Promise<SubscriptionList> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(isNull(subscriptions.deletedAt))
    .orderBy(desc(subscriptions.updatedAt));
  const tagMap = await tagsForSubscriptions(
    db,
    rows.map((row) => row.id),
  );
  const chargeRows =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(subscriptionCharges)
          .where(
            inArray(
              subscriptionCharges.subscriptionId,
              rows.map((row) => row.id),
            ),
          );

  const chargesBySubscription = new Map<string, typeof chargeRows>();
  for (const charge of chargeRows) {
    const existing = chargesBySubscription.get(charge.subscriptionId) ?? [];
    existing.push(charge);
    chargesBySubscription.set(charge.subscriptionId, existing);
  }

  const items = rows.map((row) => ({
    ...mapSubscription(row, tagMap.get(row.id) ?? []),
    metrics: metricsFor(row, chargesBySubscription.get(row.id) ?? []),
  }));
  let projectedMonthly = 0n;
  let projectedYearly = 0n;
  let actualSpend = 0n;
  let activeCount = 0;
  for (const item of items) {
    if (item.status === 'active' || item.status === 'trial') activeCount += 1;
    projectedMonthly += BigInt(item.metrics.projectedMonthlyMinor);
    projectedYearly += BigInt(item.metrics.projectedYearlyMinor);
    actualSpend += BigInt(item.metrics.actualSpendMinor);
  }

  return {
    items,
    totals: {
      activeCount,
      projectedMonthlyMinor: projectedMonthly.toString(),
      projectedYearlyMinor: projectedYearly.toString(),
      actualSpendMinor: actualSpend.toString(),
    },
  };
}

export async function getSubscriptionDetail(
  db: Database,
  id: string,
): Promise<SubscriptionDetail | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .limit(1);
  if (!row) return null;
  const charges = await db
    .select()
    .from(subscriptionCharges)
    .where(eq(subscriptionCharges.subscriptionId, id))
    .orderBy(desc(subscriptionCharges.occurredOn), desc(subscriptionCharges.createdAt));
  const tagMap = await tagsForSubscriptions(db, [id]);
  const attachments = await db
    .select()
    .from(subscriptionAttachments)
    .where(eq(subscriptionAttachments.subscriptionId, id))
    .orderBy(
      desc(subscriptionAttachments.sortOrder),
      desc(subscriptionAttachments.createdAt),
    );
  const priceChanges = await db
    .select()
    .from(subscriptionPriceChanges)
    .where(eq(subscriptionPriceChanges.subscriptionId, id))
    .orderBy(
      desc(subscriptionPriceChanges.effectiveOn),
      desc(subscriptionPriceChanges.createdAt),
    );
  return {
    ...mapSubscription(row, tagMap.get(id) ?? []),
    metrics: metricsFor(row, charges),
    charges: charges.map(mapCharge),
    priceChanges: priceChanges.map(mapPriceChange),
    attachments: attachments.map(mapSubscriptionAttachment),
  };
}

export async function createSubscription(
  db: Database,
  input: CreateSubscriptionInput,
): Promise<SubscriptionDetail> {
  const [row] = await db
    .insert(subscriptions)
    .values({
      kind: input.kind,
      name: input.name,
      vendor: input.vendor ?? null,
      categoryLabel: input.categoryLabel ?? null,
      status: input.status,
      billingCycle: input.billingCycle,
      customIntervalDays: input.customIntervalDays ?? null,
      currency: input.currency,
      amountMinor: BigInt(input.amountMinor),
      discountMinor: BigInt(input.discountMinor ?? '0'),
      discountEndsOn: input.discountEndsOn ?? null,
      autoRenew: input.autoRenew,
      seats: input.seats ?? null,
      startedOn: input.startedOn ?? null,
      trialEndsOn: input.trialEndsOn ?? null,
      nextBillingOn: input.nextBillingOn ?? null,
      cancelledOn: input.cancelledOn ?? null,
      expiresOn: input.expiresOn ?? null,
      accountHint: input.accountHint ?? null,
      passwordManagerUrl: input.passwordManagerUrl ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('Unable to create subscription.');
  await db.insert(subscriptionPriceChanges).values({
    subscriptionId: row.id,
    kind: 'initial',
    amountMinor: row.amountMinor,
    discountMinor: row.discountMinor,
    effectiveOn: input.startedOn ?? new Date().toISOString().slice(0, 10),
    note: '初始价格',
  });
  await syncSubscriptionTags(db, row.id, input.tagIds);
  return (await getSubscriptionDetail(db, row.id))!;
}

export async function updateSubscription(
  db: Database,
  id: string,
  input: UpdateSubscriptionInput,
): Promise<SubscriptionDetail | null> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .limit(1);
  if (!existing) return null;

  const [row] = await db
    .update(subscriptions)
    .set({
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.vendor === undefined ? {} : { vendor: input.vendor || null }),
      ...(input.categoryLabel === undefined
        ? {}
        : { categoryLabel: input.categoryLabel || null }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.billingCycle === undefined ? {} : { billingCycle: input.billingCycle }),
      ...(input.customIntervalDays === undefined
        ? {}
        : { customIntervalDays: input.customIntervalDays ?? null }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.amountMinor === undefined
        ? {}
        : { amountMinor: BigInt(input.amountMinor) }),
      ...(input.discountMinor === undefined
        ? {}
        : { discountMinor: BigInt(input.discountMinor) }),
      ...(input.discountEndsOn === undefined
        ? {}
        : { discountEndsOn: input.discountEndsOn ?? null }),
      ...(input.autoRenew === undefined ? {} : { autoRenew: input.autoRenew }),
      ...(input.seats === undefined ? {} : { seats: input.seats ?? null }),
      ...(input.startedOn === undefined ? {} : { startedOn: input.startedOn ?? null }),
      ...(input.trialEndsOn === undefined
        ? {}
        : { trialEndsOn: input.trialEndsOn ?? null }),
      ...(input.nextBillingOn === undefined
        ? {}
        : { nextBillingOn: input.nextBillingOn ?? null }),
      ...(input.cancelledOn === undefined
        ? {}
        : { cancelledOn: input.cancelledOn ?? null }),
      ...(input.expiresOn === undefined ? {} : { expiresOn: input.expiresOn ?? null }),
      ...(input.accountHint === undefined
        ? {}
        : { accountHint: input.accountHint || null }),
      ...(input.passwordManagerUrl === undefined
        ? {}
        : { passwordManagerUrl: input.passwordManagerUrl || null }),
      ...(input.notes === undefined ? {} : { notes: input.notes || null }),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, id))
    .returning();
  if (!row) return null;
  await syncSubscriptionTags(db, id, input.tagIds);
  return getSubscriptionDetail(db, id);
}

export async function changeSubscriptionPrice(
  db: Database,
  subscriptionId: string,
  input: CreateSubscriptionPriceChangeInput,
): Promise<SubscriptionDetail> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), isNull(subscriptions.deletedAt)))
    .limit(1);
  if (!existing) {
    throw new SubscriptionServiceError('NOT_FOUND', '没有找到该订阅或许可');
  }
  const discountMinor = BigInt(input.discountMinor ?? '0');
  const amountMinor = BigInt(input.amountMinor);
  if (discountMinor > amountMinor) {
    throw new SubscriptionServiceError('INVALID_INPUT', '优惠金额不能高于标价');
  }
  await db.transaction(async (transaction) => {
    await transaction
      .update(subscriptions)
      .set({
        amountMinor,
        discountMinor,
        discountEndsOn: input.discountEndsOn ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId));
    await transaction.insert(subscriptionPriceChanges).values({
      subscriptionId,
      kind: input.kind,
      amountMinor,
      discountMinor,
      effectiveOn: input.effectiveOn,
      note: input.note ?? null,
    });
  });
  const detail = await getSubscriptionDetail(db, subscriptionId);
  if (!detail) throw new Error('Updated subscription could not be loaded.');
  return detail;
}

export async function applySubscriptionAction(
  db: Database,
  subscriptionId: string,
  input: SubscriptionActionInput,
): Promise<SubscriptionDetail> {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, subscriptionId), isNull(subscriptions.deletedAt)))
    .limit(1);
  if (!existing) {
    throw new SubscriptionServiceError('NOT_FOUND', '没有找到该订阅或许可');
  }
  if (existing.kind === 'digital_license' && input.action !== 'cancel') {
    throw new SubscriptionServiceError('CONFLICT', '数字许可不支持订阅状态操作');
  }

  const update = {
    updatedAt: new Date(),
    ...(input.action === 'convert_trial'
      ? {
          status: 'active' as const,
          nextBillingOn: input.nextBillingOn ?? existing.nextBillingOn,
        }
      : {}),
    ...(input.action === 'pause' ? { status: 'paused' as const } : {}),
    ...(input.action === 'resume' ? { status: 'active' as const, autoRenew: true } : {}),
    ...(input.action === 'cancel'
      ? {
          status: 'cancelled' as const,
          cancelledOn: input.effectiveOn,
          autoRenew: false,
        }
      : {}),
    ...(input.action === 'renew'
      ? {
          status: 'active' as const,
          cancelledOn: null,
          autoRenew: true,
          nextBillingOn: input.nextBillingOn ?? existing.nextBillingOn,
        }
      : {}),
  };

  if (input.action === 'convert_trial' && existing.status !== 'trial') {
    throw new SubscriptionServiceError('CONFLICT', '只有试用中的订阅可以转为正式订阅');
  }
  if (input.action === 'pause' && !['active', 'trial'].includes(existing.status)) {
    throw new SubscriptionServiceError('CONFLICT', '只有进行中的订阅可以暂停');
  }
  if (input.action === 'resume' && existing.status !== 'paused') {
    throw new SubscriptionServiceError('CONFLICT', '只有已暂停的订阅可以恢复');
  }
  if (input.action === 'renew' && !['cancelled', 'expired'].includes(existing.status)) {
    throw new SubscriptionServiceError('CONFLICT', '只有已取消或到期的订阅可以续费');
  }

  await db.update(subscriptions).set(update).where(eq(subscriptions.id, subscriptionId));
  const detail = await getSubscriptionDetail(db, subscriptionId);
  if (!detail) throw new Error('Updated subscription could not be loaded.');
  return detail;
}

export async function softDeleteSubscription(db: Database, id: string): Promise<boolean> {
  const [row] = await db
    .update(subscriptions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), isNull(subscriptions.deletedAt)))
    .returning({ id: subscriptions.id });
  return Boolean(row);
}

export async function addSubscriptionCharge(
  db: Database,
  subscriptionId: string,
  input: CreateSubscriptionChargeInput,
): Promise<SubscriptionCharge> {
  const detail = await getSubscriptionDetail(db, subscriptionId);
  if (!detail) {
    throw new SubscriptionServiceError('NOT_FOUND', '没有找到该订阅或许可');
  }

  const status =
    input.status ?? (input.kind === 'planned' ? 'planned' : ('succeeded' as const));

  const [row] = await db
    .insert(subscriptionCharges)
    .values({
      subscriptionId,
      kind: input.kind,
      status,
      currency: input.currency ?? detail.currency,
      amountMinor: BigInt(input.amountMinor),
      occurredOn: input.occurredOn,
      note: input.note ?? null,
    })
    .returning();
  if (!row) throw new Error('Unable to create subscription charge.');

  await db
    .update(subscriptions)
    .set({ updatedAt: new Date() })
    .where(eq(subscriptions.id, subscriptionId));

  return mapCharge(row);
}
