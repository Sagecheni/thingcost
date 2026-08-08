import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const acquisitionTypeEnum = pgEnum('acquisition_type', [
  'purchase',
  'gift',
  'inheritance',
  'self_made',
  'exchange',
  'unknown',
]);

export const costKnowledgeEnum = pgEnum('cost_knowledge', [
  'known_amount',
  'known_zero',
  'unknown',
]);

export const ownershipStateEnum = pgEnum('ownership_state', ['held', 'disposed']);

export const financialEventTypeEnum = pgEnum('financial_event_type', [
  'acquisition',
  'refund',
  'shipping',
  'tax',
  'repair',
  'upgrade',
  'accessory',
  'fee',
  'disposal_fee',
  'sale_proceeds',
  'other',
]);

export const financialDirectionEnum = pgEnum('financial_direction', [
  'outflow',
  'inflow',
]);

export const conditionGradeEnum = pgEnum('condition_grade', [
  'new',
  'like_new',
  'good',
  'fair',
  'poor',
]);

export const attachmentKindEnum = pgEnum('attachment_kind', ['photo', 'document']);

export const orderAllocationMethodEnum = pgEnum('order_allocation_method', [
  'proportional',
  'manual',
]);

export const assetRelationshipTypeEnum = pgEnum('asset_relationship_type', [
  'belongs_to',
  'paired_with',
]);

export const wishlistPriorityEnum = pgEnum('wishlist_priority', [
  'low',
  'medium',
  'high',
]);
export const wishlistStatusEnum = pgEnum('wishlist_status', [
  'active',
  'converted',
  'archived',
]);

export const reminderKindEnum = pgEnum('reminder_kind', [
  'general',
  'warranty_expiry',
  'maintenance',
  'loan_return',
  'renewal',
]);
export const reminderTriggerModeEnum = pgEnum('reminder_trigger_mode', [
  'date',
  'datetime',
]);
export const reminderRecurrenceKindEnum = pgEnum('reminder_recurrence_kind', [
  'once',
  'recurring',
]);
export const reminderFrequencyEnum = pgEnum('reminder_frequency', [
  'day',
  'week',
  'month',
  'year',
]);
export const reminderTaskModeEnum = pgEnum('reminder_task_mode', [
  'notification',
  'actionable',
]);
export const reminderStatusEnum = pgEnum('reminder_status', [
  'active',
  'paused',
  'archived',
]);
export const reminderChannelModeEnum = pgEnum('reminder_channel_mode', [
  'default',
  'override',
  'none',
]);
export const reminderOccurrenceStatusEnum = pgEnum('reminder_occurrence_status', [
  'pending',
  'acknowledged',
  'dismissed',
  'completed',
]);
export const notificationProviderEnum = pgEnum('notification_provider', [
  'telegram',
  'webhook',
  'wecom',
  'serverchan',
  'pushplus',
]);

export const subscriptionKindEnum = pgEnum('subscription_kind', [
  'subscription',
  'digital_license',
]);
export const subscriptionBillingCycleEnum = pgEnum('subscription_billing_cycle', [
  'monthly',
  'yearly',
  'custom',
  'one_time',
]);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'paused',
  'cancelled',
  'expired',
]);
export const subscriptionChargeKindEnum = pgEnum('subscription_charge_kind', [
  'planned',
  'actual',
]);
export const subscriptionChargeStatusEnum = pgEnum('subscription_charge_status', [
  'planned',
  'succeeded',
  'failed',
  'refunded',
  'waived',
]);
export const subscriptionPriceChangeKindEnum = pgEnum('subscription_price_change_kind', [
  'initial',
  'discount',
  'price_change',
]);
export const reminderDeliveryKindEnum = pgEnum('reminder_delivery_kind', [
  'lead',
  'repeat',
  'snooze',
]);
export const reminderDeliveryStatusEnum = pgEnum('reminder_delivery_status', [
  'queued',
  'processing',
  'sent',
  'failed',
  'cancelled',
]);

export const defectTypeEnum = pgEnum('defect_type', [
  'scratch',
  'dent',
  'crack',
  'missing_part',
  'functional_issue',
  'stain',
  'wear',
  'repair_history',
  'other',
]);

export const appSettings = pgTable('app_settings', {
  id: varchar('id', { length: 32 }).primaryKey().default('default'),
  timeZone: varchar('time_zone', { length: 100 }).notNull(),
  baseCurrency: char('base_currency', { length: 3 }).notNull(),
  personalApiTokensEnabled: boolean('personal_api_tokens_enabled')
    .notNull()
    .default(false),
  initializedAt: timestamp('initialized_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 64 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('admin_users_username_unique').on(sql`lower(${table.username})`),
  ],
);

export const personalAccessTokens = pgTable(
  'personal_access_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('personal_access_tokens_hash_unique').on(table.tokenHash),
    index('personal_access_tokens_admin_idx').on(table.adminId, table.createdAt),
    check(
      'personal_access_tokens_scopes_not_empty',
      sql`cardinality(${table.scopes}) > 0`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: char('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_admin_id_idx').on(table.adminId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 24 }),
    icon: varchar('icon', { length: 64 }),
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('categories_active_name_unique')
      .on(sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 24 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('tags_active_name_unique')
      .on(sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const assetStatuses = pgTable(
  'asset_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    countsTowardService: boolean('counts_toward_service').notNull(),
    ownershipState: ownershipStateEnum('ownership_state').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [uniqueIndex('asset_statuses_code_unique').on(table.code)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    acquisitionType: acquisitionTypeEnum('acquisition_type').notNull(),
    acquisitionDate: date('acquisition_date', { mode: 'string' }).notNull(),
    costKnowledge: costKnowledgeEnum('cost_knowledge').notNull(),
    priceCurrency: char('price_currency', { length: 3 }),
    originalPriceMinor: bigint('original_price_minor', { mode: 'bigint' }),
    discountMinor: bigint('discount_minor', { mode: 'bigint' }),
    brand: varchar('brand', { length: 120 }),
    model: varchar('model', { length: 160 }),
    serialNumber: varchar('serial_number', { length: 160 }),
    purchaseChannel: varchar('purchase_channel', { length: 160 }),
    orderNumber: varchar('order_number', { length: 160 }),
    warrantyStartDate: date('warranty_start_date', { mode: 'string' }),
    warrantyEndDate: date('warranty_end_date', { mode: 'string' }),
    extendedWarrantyEndDate: date('extended_warranty_end_date', { mode: 'string' }),
    extendedWarrantyProvider: varchar('extended_warranty_provider', { length: 160 }),
    currentStatusId: uuid('current_status_id')
      .notNull()
      .references(() => assetStatuses.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    purgeAfter: timestamp('purge_after', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('assets_category_id_idx').on(table.categoryId),
    index('assets_current_status_id_idx').on(table.currentStatusId),
    index('assets_acquisition_date_idx').on(table.acquisitionDate),
    index('assets_deleted_at_idx').on(table.deletedAt),
    check(
      'assets_original_price_non_negative',
      sql`${table.originalPriceMinor} is null or ${table.originalPriceMinor} >= 0`,
    ),
    check(
      'assets_discount_non_negative',
      sql`${table.discountMinor} is null or ${table.discountMinor} >= 0`,
    ),
  ],
);

export const assetTags = pgTable(
  'asset_tags',
  {
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.tagId] }),
    index('asset_tags_tag_id_idx').on(table.tagId),
  ],
);

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    currency: char('currency', { length: 3 }).notNull(),
    currentPriceMinor: bigint('current_price_minor', { mode: 'bigint' }),
    currentPriceObservedOn: date('current_price_observed_on', { mode: 'string' }),
    targetPriceMinor: bigint('target_price_minor', { mode: 'bigint' }),
    budgetMinor: bigint('budget_minor', { mode: 'bigint' }),
    priority: wishlistPriorityEnum('priority').notNull().default('medium'),
    plannedPurchaseDate: date('planned_purchase_date', { mode: 'string' }),
    status: wishlistStatusEnum('status').notNull().default('active'),
    convertedAssetId: uuid('converted_asset_id').references(() => assets.id, {
      onDelete: 'restrict',
    }),
    convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('wishlist_items_status_updated_idx').on(table.status, table.updatedAt),
    index('wishlist_items_category_idx').on(table.categoryId),
    index('wishlist_items_planned_date_idx').on(table.plannedPurchaseDate),
    uniqueIndex('wishlist_items_converted_asset_unique')
      .on(table.convertedAssetId)
      .where(sql`${table.convertedAssetId} is not null`),
    check(
      'wishlist_items_current_price_non_negative',
      sql`${table.currentPriceMinor} is null or ${table.currentPriceMinor} >= 0`,
    ),
    check(
      'wishlist_items_target_price_non_negative',
      sql`${table.targetPriceMinor} is null or ${table.targetPriceMinor} >= 0`,
    ),
    check(
      'wishlist_items_budget_non_negative',
      sql`${table.budgetMinor} is null or ${table.budgetMinor} >= 0`,
    ),
    check(
      'wishlist_items_current_price_date_pair',
      sql`(${table.currentPriceMinor} is null and ${table.currentPriceObservedOn} is null) or (${table.currentPriceMinor} is not null and ${table.currentPriceObservedOn} is not null)`,
    ),
    check(
      'wishlist_items_conversion_pair',
      sql`(${table.status} = 'converted' and ${table.convertedAssetId} is not null and ${table.convertedAt} is not null) or (${table.status} <> 'converted' and ${table.convertedAssetId} is null and ${table.convertedAt} is null)`,
    ),
  ],
);

export const wishlistMarketplaceLinks = pgTable(
  'wishlist_marketplace_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wishlistItemId: uuid('wishlist_item_id')
      .notNull()
      .references(() => wishlistItems.id, { onDelete: 'cascade' }),
    marketplace: varchar('marketplace', { length: 120 }).notNull(),
    url: text('url').notNull(),
    note: varchar('note', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('wishlist_links_item_sort_idx').on(table.wishlistItemId, table.sortOrder),
    check('wishlist_links_sort_non_negative', sql`${table.sortOrder} >= 0`),
  ],
);

export const wishlistPriceSnapshots = pgTable(
  'wishlist_price_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wishlistItemId: uuid('wishlist_item_id')
      .notNull()
      .references(() => wishlistItems.id, { onDelete: 'cascade' }),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    observedOn: date('observed_on', { mode: 'string' }).notNull(),
    marketplaceLinkId: uuid('marketplace_link_id').references(
      () => wishlistMarketplaceLinks.id,
      { onDelete: 'set null' },
    ),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('wishlist_prices_item_date_idx').on(
      table.wishlistItemId,
      table.observedOn,
      table.createdAt,
    ),
    check('wishlist_prices_amount_non_negative', sql`${table.amountMinor} >= 0`),
  ],
);

export const wishlistImages = pgTable(
  'wishlist_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wishlistItemId: uuid('wishlist_item_id')
      .notNull()
      .references(() => wishlistItems.id, { onDelete: 'cascade' }),
    storageKey: varchar('storage_key', { length: 200 }).notNull(),
    thumbnailStorageKey: varchar('thumbnail_storage_key', { length: 200 }).notNull(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mediaType: varchar('media_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('wishlist_images_one_per_item').on(table.wishlistItemId),
    uniqueIndex('wishlist_images_storage_key_unique').on(table.storageKey),
    uniqueIndex('wishlist_images_thumbnail_key_unique').on(table.thumbnailStorageKey),
    check('wishlist_images_size_positive', sql`${table.sizeBytes} > 0`),
    check(
      'wishlist_images_dimensions_positive',
      sql`${table.width} > 0 and ${table.height} > 0`,
    ),
    check(
      'wishlist_images_media_type',
      sql`${table.mediaType} in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')`,
    ),
  ],
);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant: varchar('merchant', { length: 160 }),
    orderNumber: varchar('order_number', { length: 160 }),
    orderedOn: date('ordered_on', { mode: 'string' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    subtotalMinor: bigint('subtotal_minor', { mode: 'bigint' }).notNull(),
    discountMinor: bigint('discount_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    shippingMinor: bigint('shipping_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    taxMinor: bigint('tax_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    feeMinor: bigint('fee_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    totalPaidMinor: bigint('total_paid_minor', { mode: 'bigint' }).notNull(),
    baseTotalPaidMinor: bigint('base_total_paid_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    baseCurrency: char('base_currency', { length: 3 }).notNull().default('CNY'),
    exchangeRate: numeric('exchange_rate', { precision: 24, scale: 12 })
      .notNull()
      .default('1'),
    exchangeRateSource: varchar('exchange_rate_source', { length: 40 })
      .notNull()
      .default('legacy'),
    exchangeRateDate: date('exchange_rate_date', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_DATE`),
    exchangeRateFallback: boolean('exchange_rate_fallback').notNull().default(false),
    allocationMethod: orderAllocationMethodEnum('allocation_method').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('purchase_orders_ordered_on_idx').on(table.orderedOn),
    index('purchase_orders_order_number_idx').on(table.orderNumber),
    check('purchase_orders_subtotal_positive', sql`${table.subtotalMinor} > 0`),
    check('purchase_orders_discount_non_negative', sql`${table.discountMinor} >= 0`),
    check('purchase_orders_shipping_non_negative', sql`${table.shippingMinor} >= 0`),
    check('purchase_orders_tax_non_negative', sql`${table.taxMinor} >= 0`),
    check('purchase_orders_fee_non_negative', sql`${table.feeMinor} >= 0`),
    check(
      'purchase_orders_discount_within_subtotal',
      sql`${table.discountMinor} <= ${table.subtotalMinor}`,
    ),
    check(
      'purchase_orders_total_matches_components',
      sql`${table.totalPaidMinor} = ${table.subtotalMinor} - ${table.discountMinor} + ${table.shippingMinor} + ${table.taxMinor} + ${table.feeMinor}`,
    ),
    check(
      'purchase_orders_base_total_non_negative',
      sql`${table.baseTotalPaidMinor} >= 0`,
    ),
    check('purchase_orders_exchange_rate_positive', sql`${table.exchangeRate} > 0`),
  ],
);

export const assetAttachments = pgTable(
  'asset_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull(),
    storageKey: varchar('storage_key', { length: 200 }).notNull(),
    thumbnailStorageKey: varchar('thumbnail_storage_key', { length: 200 }),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mediaType: varchar('media_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    isCover: boolean('is_cover').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('asset_attachments_asset_sort_idx').on(table.assetId, table.sortOrder),
    uniqueIndex('asset_attachments_storage_key_unique').on(table.storageKey),
    uniqueIndex('asset_attachments_thumbnail_key_unique')
      .on(table.thumbnailStorageKey)
      .where(sql`${table.thumbnailStorageKey} is not null`),
    uniqueIndex('asset_attachments_one_cover_per_asset')
      .on(table.assetId)
      .where(sql`${table.isCover} = true`),
    check('asset_attachments_size_positive', sql`${table.sizeBytes} > 0`),
    check('asset_attachments_sort_non_negative', sql`${table.sortOrder} >= 0`),
    check(
      'asset_attachments_dimensions_valid',
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} > 0 and ${table.height} > 0)`,
    ),
  ],
);

export const assetRelationships = pgTable(
  'asset_relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    targetAssetId: uuid('target_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    type: assetRelationshipTypeEnum('type').notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('asset_relationships_source_idx').on(table.sourceAssetId),
    index('asset_relationships_target_idx').on(table.targetAssetId),
    uniqueIndex('asset_relationships_unique').on(
      table.sourceAssetId,
      table.targetAssetId,
      table.type,
    ),
    uniqueIndex('asset_relationships_one_parent')
      .on(table.sourceAssetId)
      .where(sql`${table.type} = 'belongs_to'`),
    check(
      'asset_relationships_not_self',
      sql`${table.sourceAssetId} <> ${table.targetAssetId}`,
    ),
  ],
);

export const lifecycleEvents = pgTable(
  'lifecycle_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => assetStatuses.id, { onDelete: 'restrict' }),
    effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidReason: text('void_reason'),
    correctionOfId: uuid('correction_of_id'),
  },
  (table) => [
    index('lifecycle_events_asset_date_idx').on(
      table.assetId,
      table.effectiveDate,
      table.createdAt,
    ),
  ],
);

export const financialEvents = pgTable(
  'financial_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    type: financialEventTypeEnum('type').notNull(),
    direction: financialDirectionEnum('direction').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    baseAmountMinor: bigint('base_amount_minor', { mode: 'bigint' }).notNull(),
    baseCurrency: char('base_currency', { length: 3 }).notNull(),
    exchangeRate: numeric('exchange_rate', { precision: 24, scale: 12 })
      .notNull()
      .default('1'),
    exchangeRateSource: varchar('exchange_rate_source', { length: 40 })
      .notNull()
      .default('legacy'),
    exchangeRateDate: date('exchange_rate_date', { mode: 'string' })
      .notNull()
      .default(sql`CURRENT_DATE`),
    exchangeRateFallback: boolean('exchange_rate_fallback').notNull().default(false),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    includeInNetCost: boolean('include_in_net_cost').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidReason: text('void_reason'),
    correctionOfId: uuid('correction_of_id'),
  },
  (table) => [
    index('financial_events_asset_date_idx').on(table.assetId, table.occurredOn),
    check('financial_events_amount_positive', sql`${table.amountMinor} > 0`),
    check('financial_events_base_amount_positive', sql`${table.baseAmountMinor} > 0`),
    check('financial_events_exchange_rate_positive', sql`${table.exchangeRate} > 0`),
  ],
);

export const purchaseOrderItems = pgTable(
  'purchase_order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    assetNameSnapshot: varchar('asset_name_snapshot', { length: 160 }).notNull(),
    categoryNameSnapshot: varchar('category_name_snapshot', { length: 120 }).notNull(),
    statusNameSnapshot: varchar('status_name_snapshot', { length: 80 }).notNull(),
    acquisitionFinancialEventId: uuid('acquisition_financial_event_id').references(
      () => financialEvents.id,
      { onDelete: 'set null' },
    ),
    listedPriceMinor: bigint('listed_price_minor', { mode: 'bigint' }).notNull(),
    allocatedDiscountMinor: bigint('allocated_discount_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    allocatedShippingMinor: bigint('allocated_shipping_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    allocatedTaxMinor: bigint('allocated_tax_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    allocatedFeeMinor: bigint('allocated_fee_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    allocationAdjustmentMinor: bigint('allocation_adjustment_minor', {
      mode: 'bigint',
    })
      .notNull()
      .default(sql`0`),
    allocatedAmountMinor: bigint('allocated_amount_minor', { mode: 'bigint' }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('purchase_order_items_order_sort_idx').on(table.orderId, table.sortOrder),
    uniqueIndex('purchase_order_items_asset_unique').on(table.assetId),
    uniqueIndex('purchase_order_items_financial_event_unique')
      .on(table.acquisitionFinancialEventId)
      .where(sql`${table.acquisitionFinancialEventId} is not null`),
    check(
      'purchase_order_items_listed_non_negative',
      sql`${table.listedPriceMinor} >= 0`,
    ),
    check(
      'purchase_order_items_discount_non_negative',
      sql`${table.allocatedDiscountMinor} >= 0`,
    ),
    check(
      'purchase_order_items_shipping_non_negative',
      sql`${table.allocatedShippingMinor} >= 0`,
    ),
    check('purchase_order_items_tax_non_negative', sql`${table.allocatedTaxMinor} >= 0`),
    check('purchase_order_items_fee_non_negative', sql`${table.allocatedFeeMinor} >= 0`),
    check(
      'purchase_order_items_amount_non_negative',
      sql`${table.allocatedAmountMinor} >= 0`,
    ),
    check(
      'purchase_order_items_discount_within_listed',
      sql`${table.allocatedDiscountMinor} <= ${table.listedPriceMinor}`,
    ),
    check(
      'purchase_order_items_amount_matches_components',
      sql`${table.allocatedAmountMinor} = ${table.listedPriceMinor} - ${table.allocatedDiscountMinor} + ${table.allocatedShippingMinor} + ${table.allocatedTaxMinor} + ${table.allocatedFeeMinor} + ${table.allocationAdjustmentMinor}`,
    ),
    check('purchase_order_items_sort_non_negative', sql`${table.sortOrder} >= 0`),
  ],
);

export const conditionEvents = pgTable(
  'condition_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    grade: conditionGradeEnum('grade').notNull(),
    observedOn: date('observed_on', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('condition_events_asset_date_idx').on(
      table.assetId,
      table.observedOn,
      table.createdAt,
    ),
  ],
);

export const conditionDefects = pgTable(
  'condition_defects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conditionEventId: uuid('condition_event_id')
      .notNull()
      .references(() => conditionEvents.id, { onDelete: 'cascade' }),
    type: defectTypeEnum('type').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
  },
  (table) => [index('condition_defects_event_idx').on(table.conditionEventId)],
);

export const loans = pgTable(
  'loans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    borrower: varchar('borrower', { length: 160 }).notNull(),
    lentOn: date('lent_on', { mode: 'string' }).notNull(),
    dueOn: date('due_on', { mode: 'string' }),
    returnedOn: date('returned_on', { mode: 'string' }),
    note: text('note'),
    returnNote: text('return_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('loans_asset_lent_on_idx').on(table.assetId, table.lentOn),
    uniqueIndex('loans_one_open_per_asset')
      .on(table.assetId)
      .where(sql`${table.returnedOn} is null`),
    check(
      'loans_due_not_before_lent',
      sql`${table.dueOn} is null or ${table.dueOn} >= ${table.lentOn}`,
    ),
    check(
      'loans_return_not_before_lent',
      sql`${table.returnedOn} is null or ${table.returnedOn} >= ${table.lentOn}`,
    ),
  ],
);

export const repairs = pgTable(
  'repairs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    issue: varchar('issue', { length: 500 }).notNull(),
    provider: varchar('provider', { length: 160 }),
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    completedOn: date('completed_on', { mode: 'string' }),
    costFinancialEventId: uuid('cost_financial_event_id').references(
      () => financialEvents.id,
      { onDelete: 'set null' },
    ),
    note: text('note'),
    completionNote: text('completion_note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('repairs_asset_sent_on_idx').on(table.assetId, table.sentOn),
    uniqueIndex('repairs_one_open_per_asset')
      .on(table.assetId)
      .where(sql`${table.completedOn} is null`),
    uniqueIndex('repairs_financial_event_unique')
      .on(table.costFinancialEventId)
      .where(sql`${table.costFinancialEventId} is not null`),
    check(
      'repairs_completion_not_before_sent',
      sql`${table.completedOn} is null or ${table.completedOn} >= ${table.sentOn}`,
    ),
  ],
);

export const notificationChannels = pgTable(
  'notification_channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: notificationProviderEnum('provider').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    configurationCiphertext: text('configuration_ciphertext').notNull(),
    configurationIv: varchar('configuration_iv', { length: 64 }).notNull(),
    configurationTag: varchar('configuration_tag', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notification_channels_provider_idx').on(table.provider),
    index('notification_channels_default_idx').on(table.enabled, table.isDefault),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    kind: reminderKindEnum('kind').notNull().default('general'),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    triggerMode: reminderTriggerModeEnum('trigger_mode').notNull(),
    anchorDate: date('anchor_date', { mode: 'string' }).notNull(),
    anchorTime: char('anchor_time', { length: 5 }).notNull(),
    anchorAt: timestamp('anchor_at', { withTimezone: true, mode: 'date' }).notNull(),
    timeZone: varchar('time_zone', { length: 100 }).notNull(),
    recurrenceKind: reminderRecurrenceKindEnum('recurrence_kind').notNull(),
    frequency: reminderFrequencyEnum('frequency'),
    recurrenceInterval: integer('recurrence_interval'),
    endsOn: date('ends_on', { mode: 'string' }),
    occurrenceLimit: integer('occurrence_limit'),
    leadMinutes: integer('lead_minutes')
      .array()
      .notNull()
      .default(sql`array[0]::integer[]`),
    taskMode: reminderTaskModeEnum('task_mode').notNull().default('notification'),
    repeatIntervalMinutes: integer('repeat_interval_minutes').notNull().default(1440),
    maxRepeats: integer('max_repeats').notNull().default(0),
    channelMode: reminderChannelModeEnum('channel_mode').notNull().default('default'),
    channelKeys: text('channel_keys')
      .array()
      .notNull()
      .default(sql`array[]::text[]`),
    status: reminderStatusEnum('status').notNull().default('active'),
    nextSequence: integer('next_sequence').notNull().default(0),
    nextOccurrenceAt: timestamp('next_occurrence_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('reminders_asset_idx').on(table.assetId),
    index('reminders_expansion_idx').on(table.status, table.nextOccurrenceAt),
    check(
      'reminders_anchor_time_format',
      sql`${table.anchorTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check(
      'reminders_recurrence_fields',
      sql`(${table.recurrenceKind} = 'once' and ${table.frequency} is null and ${table.recurrenceInterval} is null) or (${table.recurrenceKind} = 'recurring' and ${table.frequency} is not null and ${table.recurrenceInterval} > 0 and (${table.endsOn} is not null or ${table.occurrenceLimit} is not null))`,
    ),
    check(
      'reminders_occurrence_limit_positive',
      sql`${table.occurrenceLimit} is null or ${table.occurrenceLimit} > 0`,
    ),
    check(
      'reminders_repeat_interval_positive',
      sql`${table.repeatIntervalMinutes} >= 10`,
    ),
    check('reminders_max_repeats_range', sql`${table.maxRepeats} between 0 and 20`),
    check(
      'reminders_notification_has_no_repeats',
      sql`${table.taskMode} <> 'notification' or ${table.maxRepeats} = 0`,
    ),
    check(
      'reminders_override_has_channels',
      sql`${table.channelMode} <> 'override' or cardinality(${table.channelKeys}) > 0`,
    ),
    check(
      'reminders_non_override_has_no_channels',
      sql`${table.channelMode} = 'override' or cardinality(${table.channelKeys}) = 0`,
    ),
    check('reminders_next_sequence_non_negative', sql`${table.nextSequence} >= 0`),
  ],
);

export const reminderOccurrences = pgTable(
  'reminder_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reminderId: uuid('reminder_id')
      .notNull()
      .references(() => reminders.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: reminderOccurrenceStatusEnum('status').notNull().default('pending'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true, mode: 'date' }),
    snoozeCount: integer('snooze_count').notNull().default(0),
    repeatCount: integer('repeat_count').notNull().default(0),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true, mode: 'date' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reminder_occurrences_sequence_unique').on(
      table.reminderId,
      table.sequence,
    ),
    index('reminder_occurrences_due_idx').on(table.status, table.dueAt),
    check('reminder_occurrences_sequence_non_negative', sql`${table.sequence} >= 0`),
    check('reminder_occurrences_snooze_non_negative', sql`${table.snoozeCount} >= 0`),
    check('reminder_occurrences_repeat_non_negative', sql`${table.repeatCount} >= 0`),
  ],
);

export const reminderDeliveries = pgTable(
  'reminder_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reminderId: uuid('reminder_id')
      .notNull()
      .references(() => reminders.id, { onDelete: 'cascade' }),
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references(() => reminderOccurrences.id, { onDelete: 'cascade' }),
    channelKey: varchar('channel_key', { length: 120 }).notNull(),
    provider: notificationProviderEnum('provider').notNull(),
    kind: reminderDeliveryKindEnum('kind').notNull(),
    dedupeKey: varchar('dedupe_key', { length: 300 }).notNull(),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    status: reminderDeliveryStatusEnum('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(4),
    nextAttemptAt: timestamp('next_attempt_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    lockedBy: varchar('locked_by', { length: 160 }),
    lastError: varchar('last_error', { length: 1000 }),
    httpStatus: integer('http_status'),
    responseExcerpt: varchar('response_excerpt', { length: 500 }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reminder_deliveries_dedupe_unique').on(table.dedupeKey),
    index('reminder_deliveries_claim_idx').on(table.status, table.nextAttemptAt),
    index('reminder_deliveries_occurrence_idx').on(table.occurrenceId, table.createdAt),
    check('reminder_deliveries_attempt_non_negative', sql`${table.attemptCount} >= 0`),
    check('reminder_deliveries_max_attempts_positive', sql`${table.maxAttempts} > 0`),
  ],
);

export const valuationConfidenceEnum = pgEnum('valuation_confidence', [
  'low',
  'medium',
  'high',
]);

export const valuationReportStatusEnum = pgEnum('valuation_report_status', [
  'queued',
  'running',
  'ready',
  'adopted',
  'rejected',
  'failed',
]);

export const valuationAiProtocolEnum = pgEnum('valuation_ai_protocol', [
  'chat_completions',
  'responses',
]);

export const valuationTriggerSourceEnum = pgEnum('valuation_trigger_source', [
  'manual',
  'schedule',
  'retry',
]);

export const valuationScheduleCadenceEnum = pgEnum('valuation_schedule_cadence', [
  'manual',
  'monthly',
  'quarterly',
  'yearly',
]);

export const valuationReports = pgTable(
  'valuation_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    status: valuationReportStatusEnum('status').notNull().default('queued'),
    currency: char('currency', { length: 3 }).notNull(),
    lowMinor: bigint('low_minor', { mode: 'bigint' }),
    midMinor: bigint('mid_minor', { mode: 'bigint' }),
    highMinor: bigint('high_minor', { mode: 'bigint' }),
    confidence: valuationConfidenceEnum('confidence'),
    summary: text('summary'),
    evidenceJson: text('evidence_json').notNull().default('[]'),
    forecastsJson: text('forecasts_json').notNull().default('[]'),
    outboundSummaryJson: text('outbound_summary_json').notNull(),
    searchProvider: varchar('search_provider', { length: 80 }),
    aiProvider: varchar('ai_provider', { length: 80 }),
    aiProtocol: valuationAiProtocolEnum('ai_protocol'),
    aiModel: varchar('ai_model', { length: 160 }),
    triggerSource: valuationTriggerSourceEnum('trigger_source')
      .notNull()
      .default('manual'),
    searchCacheHit: boolean('search_cache_hit').notNull().default(false),
    durationMs: integer('duration_ms'),
    errorCode: varchar('error_code', { length: 80 }),
    errorMessage: varchar('error_message', { length: 1000 }),
    adoptedSnapshotId: uuid('adopted_snapshot_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('valuation_reports_asset_created_idx').on(table.assetId, table.createdAt),
    index('valuation_reports_status_idx').on(table.status),
    check(
      'valuation_reports_range_order',
      sql`${table.lowMinor} is null or ${table.midMinor} is null or ${table.highMinor} is null or (${table.lowMinor} <= ${table.midMinor} and ${table.midMinor} <= ${table.highMinor})`,
    ),
    check(
      'valuation_reports_amounts_non_negative',
      sql`(${table.lowMinor} is null or ${table.lowMinor} >= 0) and (${table.midMinor} is null or ${table.midMinor} >= 0) and (${table.highMinor} is null or ${table.highMinor} >= 0)`,
    ),
  ],
);

export const valuationSnapshots = pgTable(
  'valuation_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id').references(() => valuationReports.id, {
      onDelete: 'set null',
    }),
    currency: char('currency', { length: 3 }).notNull(),
    valueMinor: bigint('value_minor', { mode: 'bigint' }).notNull(),
    lowMinor: bigint('low_minor', { mode: 'bigint' }),
    highMinor: bigint('high_minor', { mode: 'bigint' }),
    confidence: valuationConfidenceEnum('confidence'),
    valuedOn: date('valued_on', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('valuation_snapshots_asset_valued_idx').on(table.assetId, table.valuedOn),
    check('valuation_snapshots_value_non_negative', sql`${table.valueMinor} >= 0`),
    check(
      'valuation_snapshots_range_non_negative',
      sql`(${table.lowMinor} is null or ${table.lowMinor} >= 0) and (${table.highMinor} is null or ${table.highMinor} >= 0)`,
    ),
  ],
);

export const valuationSchedules = pgTable(
  'valuation_schedules',
  {
    assetId: uuid('asset_id')
      .primaryKey()
      .references(() => assets.id, { onDelete: 'cascade' }),
    cadence: valuationScheduleCadenceEnum('cadence').notNull().default('manual'),
    enabled: boolean('enabled').notNull().default(false),
    nextRunAt: timestamp('next_run_at', { withTimezone: true, mode: 'date' }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'date' }),
    lastReportId: uuid('last_report_id').references(() => valuationReports.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('valuation_schedules_due_idx').on(table.enabled, table.nextRunAt)],
);

export const valuationSearchCache = pgTable(
  'valuation_search_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queryHash: char('query_hash', { length: 64 }).notNull(),
    queryText: varchar('query_text', { length: 500 }).notNull(),
    resultsJson: text('results_json').notNull(),
    provider: varchar('provider', { length: 80 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    uniqueIndex('valuation_search_cache_query_unique').on(table.queryHash),
    index('valuation_search_cache_expires_idx').on(table.expiresAt),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: subscriptionKindEnum('kind').notNull().default('subscription'),
    name: varchar('name', { length: 160 }).notNull(),
    vendor: varchar('vendor', { length: 120 }),
    categoryLabel: varchar('category_label', { length: 80 }),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    billingCycle: subscriptionBillingCycleEnum('billing_cycle').notNull(),
    customIntervalDays: integer('custom_interval_days'),
    currency: char('currency', { length: 3 }).notNull().default('CNY'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    discountMinor: bigint('discount_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    discountEndsOn: date('discount_ends_on', { mode: 'string' }),
    autoRenew: boolean('auto_renew').notNull().default(true),
    seats: integer('seats'),
    startedOn: date('started_on', { mode: 'string' }),
    trialEndsOn: date('trial_ends_on', { mode: 'string' }),
    nextBillingOn: date('next_billing_on', { mode: 'string' }),
    cancelledOn: date('cancelled_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    accountHint: varchar('account_hint', { length: 160 }),
    passwordManagerUrl: text('password_manager_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('subscriptions_status_idx').on(table.status, table.nextBillingOn),
    index('subscriptions_kind_idx').on(table.kind),
    check('subscriptions_amount_non_negative', sql`${table.amountMinor} >= 0`),
    check('subscriptions_discount_non_negative', sql`${table.discountMinor} >= 0`),
    check(
      'subscriptions_discount_not_above_amount',
      sql`${table.discountMinor} <= ${table.amountMinor}`,
    ),
    check(
      'subscriptions_custom_interval_positive',
      sql`${table.customIntervalDays} is null or ${table.customIntervalDays} > 0`,
    ),
    check(
      'subscriptions_seats_positive',
      sql`${table.seats} is null or ${table.seats} > 0`,
    ),
  ],
);

export const subscriptionPriceChanges = pgTable(
  'subscription_price_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    kind: subscriptionPriceChangeKindEnum('kind').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    discountMinor: bigint('discount_minor', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    effectiveOn: date('effective_on', { mode: 'string' }).notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscription_price_changes_subscription_idx').on(
      table.subscriptionId,
      table.effectiveOn,
    ),
    check(
      'subscription_price_changes_amount_non_negative',
      sql`${table.amountMinor} >= 0`,
    ),
    check(
      'subscription_price_changes_discount_non_negative',
      sql`${table.discountMinor} >= 0`,
    ),
    check(
      'subscription_price_changes_discount_not_above_amount',
      sql`${table.discountMinor} <= ${table.amountMinor}`,
    ),
  ],
);

export const subscriptionTags = pgTable(
  'subscription_tags',
  {
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.subscriptionId, table.tagId] }),
    index('subscription_tags_tag_idx').on(table.tagId),
  ],
);

export const subscriptionAttachments = pgTable(
  'subscription_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    kind: attachmentKindEnum('kind').notNull(),
    storageKey: varchar('storage_key', { length: 200 }).notNull(),
    thumbnailStorageKey: varchar('thumbnail_storage_key', { length: 200 }),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    mediaType: varchar('media_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscription_attachments_subscription_sort_idx').on(
      table.subscriptionId,
      table.sortOrder,
    ),
    uniqueIndex('subscription_attachments_storage_key_unique').on(table.storageKey),
    uniqueIndex('subscription_attachments_thumbnail_key_unique').on(
      table.thumbnailStorageKey,
    ),
  ],
);

export const subscriptionCharges = pgTable(
  'subscription_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    kind: subscriptionChargeKindEnum('kind').notNull(),
    status: subscriptionChargeStatusEnum('status').notNull().default('planned'),
    currency: char('currency', { length: 3 }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    note: varchar('note', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('subscription_charges_subscription_idx').on(
      table.subscriptionId,
      table.occurredOn,
    ),
    check('subscription_charges_amount_non_negative', sql`${table.amountMinor} >= 0`),
  ],
);
