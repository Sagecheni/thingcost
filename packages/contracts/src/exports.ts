import { z } from 'zod';

export const exportFormatSchema = z.literal('chronicle-export');
export const exportVersionSchema = z.literal(1);

export const exportEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['json', 'csv', 'attachment', 'thumbnail']),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
});

export const exportManifestSchema = z.object({
  format: exportFormatSchema,
  version: exportVersionSchema,
  generatedAt: z.iso.datetime(),
  apiVersion: z.literal('v1'),
  includes: z.object({
    records: z.boolean(),
    csv: z.boolean(),
    attachments: z.boolean(),
    secrets: z.literal(false),
  }),
  files: z.array(exportEntrySchema),
});

export type ExportEntry = z.infer<typeof exportEntrySchema>;
export type ExportManifest = z.infer<typeof exportManifestSchema>;
