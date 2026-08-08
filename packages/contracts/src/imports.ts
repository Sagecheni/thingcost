import { z } from 'zod';

export const importModeSchema = z.enum(['replace']);

export const importTableCountSchema = z.object({
  categories: z.number().int().nonnegative(),
  assetStatuses: z.number().int().nonnegative(),
  tags: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  financialEvents: z.number().int().nonnegative(),
  lifecycleEvents: z.number().int().nonnegative(),
  purchaseOrders: z.number().int().nonnegative(),
  assetAttachments: z.number().int().nonnegative(),
  reminders: z.number().int().nonnegative(),
  wishlistItems: z.number().int().nonnegative(),
  valuationReports: z.number().int().nonnegative(),
  valuationSnapshots: z.number().int().nonnegative(),
  valuationSchedules: z.number().int().nonnegative(),
  subscriptions: z.number().int().nonnegative(),
  subscriptionPriceChanges: z.number().int().nonnegative(),
  subscriptionCharges: z.number().int().nonnegative(),
  subscriptionTags: z.number().int().nonnegative(),
  subscriptionAttachments: z.number().int().nonnegative(),
  attachmentFiles: z.number().int().nonnegative(),
});

export const importConflictSchema = z.object({
  code: z.enum([
    'TARGET_NOT_EMPTY',
    'ID_OVERLAP',
    'NAME_OVERLAP',
    'MISSING_ATTACHMENT',
    'CHECKSUM_MISMATCH',
    'UNSUPPORTED_VERSION',
    'INVALID_ARCHIVE',
  ]),
  severity: z.enum(['info', 'warning', 'blocking']),
  message: z.string().min(1),
  detail: z.string().optional(),
});

export const portableImportPreviewSchema = z.object({
  importId: z.uuid(),
  expiresAt: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  source: z.object({
    format: z.literal('chronicle-export'),
    version: z.literal(1),
    apiVersion: z.literal('v1'),
    generatedAt: z.iso.datetime(),
  }),
  archive: importTableCountSchema,
  current: importTableCountSchema,
  conflicts: z.array(importConflictSchema),
  canApply: z.boolean(),
  modes: z.array(importModeSchema),
  notes: z.array(z.string()),
});

export const applyPortableImportInputSchema = z.object({
  importId: z.uuid(),
  mode: importModeSchema,
  confirmReplace: z.literal(true),
});

export const portableImportResultSchema = z.object({
  importId: z.uuid(),
  mode: importModeSchema,
  appliedAt: z.iso.datetime(),
  restored: importTableCountSchema,
  skipped: z.object({
    notificationChannels: z.number().int().nonnegative(),
  }),
  notes: z.array(z.string()),
});

export type ImportMode = z.infer<typeof importModeSchema>;
export type ImportTableCount = z.infer<typeof importTableCountSchema>;
export type ImportConflict = z.infer<typeof importConflictSchema>;
export type PortableImportPreview = z.infer<typeof portableImportPreviewSchema>;
export type ApplyPortableImportInput = z.infer<typeof applyPortableImportInputSchema>;
export type PortableImportResult = z.infer<typeof portableImportResultSchema>;
