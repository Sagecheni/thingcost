import { and, asc, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';

import type {
  ReminderDetail,
  ReminderOccurrence,
  ReminderSummary,
} from '@thingcost/contracts';
import {
  assetAttachments,
  assets,
  reminderDeliveries,
  reminderOccurrences,
  reminders,
  subscriptions,
  type Database,
} from '@thingcost/database';

interface ReminderAssetJoin {
  reminder: typeof reminders.$inferSelect;
  assetId: string | null;
  assetName: string | null;
  coverAttachmentId: string | null;
  subscriptionId: string | null;
  subscriptionName: string | null;
  subscriptionKind: 'subscription' | 'digital_license' | null;
}

function mapSummary(row: ReminderAssetJoin): ReminderSummary {
  return {
    id: row.reminder.id,
    asset:
      row.assetId && row.assetName
        ? {
            id: row.assetId,
            name: row.assetName,
            coverThumbnailUrl: row.coverAttachmentId
              ? `/api/v1/assets/${row.assetId}/attachments/${row.coverAttachmentId}/thumbnail`
              : null,
          }
        : null,
    subscription:
      row.subscriptionId && row.subscriptionName && row.subscriptionKind
        ? {
            id: row.subscriptionId,
            name: row.subscriptionName,
            kind: row.subscriptionKind,
          }
        : null,
    kind: row.reminder.kind,
    title: row.reminder.title,
    description: row.reminder.description,
    triggerMode: row.reminder.triggerMode,
    anchorDate: row.reminder.anchorDate,
    anchorTime: row.reminder.anchorTime,
    anchorAt: row.reminder.anchorAt.toISOString(),
    timeZone: row.reminder.timeZone,
    recurrenceKind: row.reminder.recurrenceKind,
    frequency: row.reminder.frequency,
    recurrenceInterval: row.reminder.recurrenceInterval,
    endsOn: row.reminder.endsOn,
    occurrenceLimit: row.reminder.occurrenceLimit,
    leadMinutes: row.reminder.leadMinutes,
    taskMode: row.reminder.taskMode,
    repeatIntervalMinutes: row.reminder.repeatIntervalMinutes,
    maxRepeats: row.reminder.maxRepeats,
    channelMode: row.reminder.channelMode,
    channelKeys: row.reminder.channelKeys,
    status: row.reminder.status,
    nextOccurrenceAt: row.reminder.nextOccurrenceAt?.toISOString() ?? null,
    createdAt: row.reminder.createdAt.toISOString(),
    updatedAt: row.reminder.updatedAt.toISOString(),
  };
}

function mapDelivery(row: typeof reminderDeliveries.$inferSelect) {
  return {
    id: row.id,
    channelKey: row.channelKey,
    provider: row.provider,
    kind: row.kind,
    scheduledAt: row.scheduledAt.toISOString(),
    status: row.status,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

function mapOccurrence(
  row: typeof reminderOccurrences.$inferSelect,
  deliveries?: (typeof reminderDeliveries.$inferSelect)[],
): ReminderOccurrence {
  return {
    id: row.id,
    reminderId: row.reminderId,
    sequence: row.sequence,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    repeatCount: row.repeatCount,
    lastNotifiedAt: row.lastNotifiedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    ...(deliveries === undefined ? {} : { deliveries: deliveries.map(mapDelivery) }),
  };
}

async function reminderJoins(
  db: Database,
  condition?: ReturnType<typeof eq>,
): Promise<ReminderAssetJoin[]> {
  return db
    .select({
      reminder: reminders,
      assetId: assets.id,
      assetName: assets.name,
      coverAttachmentId: assetAttachments.id,
      subscriptionId: subscriptions.id,
      subscriptionName: subscriptions.name,
      subscriptionKind: subscriptions.kind,
    })
    .from(reminders)
    .leftJoin(assets, and(eq(reminders.assetId, assets.id), isNull(assets.deletedAt)))
    .leftJoin(
      assetAttachments,
      and(eq(assetAttachments.assetId, assets.id), eq(assetAttachments.isCover, true)),
    )
    .leftJoin(
      subscriptions,
      and(
        eq(reminders.subscriptionId, subscriptions.id),
        isNull(subscriptions.deletedAt),
      ),
    )
    .where(condition)
    .orderBy(
      asc(reminders.status),
      desc(reminders.nextOccurrenceAt),
      desc(reminders.createdAt),
    );
}

export async function listReminders(db: Database): Promise<ReminderSummary[]> {
  const rows = await reminderJoins(db);
  return rows.map(mapSummary);
}

export async function getReminder(
  db: Database,
  reminderId: string,
): Promise<ReminderDetail | null> {
  const [row] = await reminderJoins(db, eq(reminders.id, reminderId));
  if (!row) return null;

  const occurrenceRows = await db
    .select()
    .from(reminderOccurrences)
    .where(eq(reminderOccurrences.reminderId, reminderId))
    .orderBy(desc(reminderOccurrences.dueAt))
    .limit(30);
  const deliveries =
    occurrenceRows.length === 0
      ? []
      : await db
          .select()
          .from(reminderDeliveries)
          .where(
            or(
              ...occurrenceRows.map((occurrence) =>
                eq(reminderDeliveries.occurrenceId, occurrence.id),
              ),
            ),
          )
          .orderBy(desc(reminderDeliveries.scheduledAt));
  const deliveriesByOccurrence = new Map<string, (typeof deliveries)[number][]>();
  for (const delivery of deliveries) {
    const current = deliveriesByOccurrence.get(delivery.occurrenceId) ?? [];
    current.push(delivery);
    deliveriesByOccurrence.set(delivery.occurrenceId, current);
  }

  return {
    ...mapSummary(row),
    occurrences: occurrenceRows.map((occurrence) =>
      mapOccurrence(occurrence, deliveriesByOccurrence.get(occurrence.id) ?? []),
    ),
  };
}

export async function listUpcomingReminderOccurrences(
  db: Database,
  from: Date,
  until: Date,
): Promise<Array<ReminderOccurrence & { reminder: ReminderSummary }>> {
  const rows = await db
    .select({
      occurrence: reminderOccurrences,
      reminder: reminders,
      assetId: assets.id,
      assetName: assets.name,
      coverAttachmentId: assetAttachments.id,
      subscriptionId: subscriptions.id,
      subscriptionName: subscriptions.name,
      subscriptionKind: subscriptions.kind,
    })
    .from(reminderOccurrences)
    .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
    .leftJoin(assets, and(eq(reminders.assetId, assets.id), isNull(assets.deletedAt)))
    .leftJoin(
      assetAttachments,
      and(eq(assetAttachments.assetId, assets.id), eq(assetAttachments.isCover, true)),
    )
    .leftJoin(
      subscriptions,
      and(
        eq(reminders.subscriptionId, subscriptions.id),
        isNull(subscriptions.deletedAt),
      ),
    )
    .where(
      and(
        eq(reminderOccurrences.status, 'pending'),
        eq(reminders.status, 'active'),
        gte(reminderOccurrences.dueAt, from),
        lte(reminderOccurrences.dueAt, until),
      ),
    )
    .orderBy(asc(reminderOccurrences.dueAt));

  return rows.map((row) => ({
    ...mapOccurrence(row.occurrence),
    reminder: mapSummary({
      reminder: row.reminder,
      assetId: row.assetId,
      assetName: row.assetName,
      coverAttachmentId: row.coverAttachmentId,
      subscriptionId: row.subscriptionId,
      subscriptionName: row.subscriptionName,
      subscriptionKind: row.subscriptionKind,
    }),
  }));
}
