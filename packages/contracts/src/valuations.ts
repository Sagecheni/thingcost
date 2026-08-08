import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  uuidSchema,
} from './common.js';

export const valuationConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const valuationReportStatusSchema = z.enum([
  'queued',
  'running',
  'ready',
  'adopted',
  'rejected',
  'failed',
]);
export const valuationAiProtocolSchema = z.enum(['chat_completions', 'responses']);
export const valuationScheduleCadenceSchema = z.enum([
  'manual',
  'monthly',
  'quarterly',
  'yearly',
]);
export const valuationTriggerSourceSchema = z.enum(['manual', 'schedule', 'retry']);

export const valuationEvidenceSchema = z.object({
  title: z.string().min(1).max(300),
  url: z.url().optional(),
  snippet: z.string().max(1_000).optional(),
  observedPriceMinor: nonNegativeMinorUnitSchema.optional(),
  currency: currencyCodeSchema.optional(),
  observedOn: isoDateSchema.optional(),
  sourceKind: z.enum(['listing', 'sold', 'retail', 'other']).default('other'),
});

export const valuationForecastSegmentSchema = z.object({
  horizonYears: z.number().int().min(1).max(10),
  lowMinor: nonNegativeMinorUnitSchema,
  midMinor: nonNegativeMinorUnitSchema,
  highMinor: nonNegativeMinorUnitSchema,
  note: z.string().max(500).optional(),
});

/** Non-sensitive fields allowed to leave the server for AI valuation. */
export const valuationOutboundSummarySchema = z.object({
  assetId: uuidSchema,
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullable(),
  model: z.string().max(160).nullable(),
  categoryName: z.string().min(1).max(80),
  acquisitionDate: isoDateSchema,
  acquisitionType: z.string().min(1).max(40),
  conditionGrade: z.enum(['new', 'like_new', 'good', 'fair', 'poor']).nullable(),
  defectSummary: z.array(z.string().max(200)).max(20),
  regionHint: z.string().min(1).max(80),
  baseCurrency: currencyCodeSchema,
  /** Public description only; private notes are never included. */
  publicDescription: z.string().max(500).nullable(),
});

export const valuationReportSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  status: valuationReportStatusSchema,
  currency: currencyCodeSchema,
  lowMinor: nonNegativeMinorUnitSchema.nullable(),
  midMinor: nonNegativeMinorUnitSchema.nullable(),
  highMinor: nonNegativeMinorUnitSchema.nullable(),
  confidence: valuationConfidenceSchema.nullable(),
  summary: z.string().nullable(),
  evidence: z.array(valuationEvidenceSchema),
  forecasts: z.array(valuationForecastSegmentSchema),
  outboundSummary: valuationOutboundSummarySchema,
  searchProvider: z.string().nullable(),
  aiProvider: z.string().nullable(),
  aiProtocol: valuationAiProtocolSchema.nullable(),
  aiModel: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  triggerSource: valuationTriggerSourceSchema,
  searchCacheHit: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  adoptedSnapshotId: uuidSchema.nullable(),
});

export const valuationScheduleSchema = z.object({
  assetId: uuidSchema,
  cadence: valuationScheduleCadenceSchema,
  enabled: z.boolean(),
  nextRunAt: z.iso.datetime().nullable(),
  lastRunAt: z.iso.datetime().nullable(),
  lastReportId: uuidSchema.nullable(),
  updatedAt: z.iso.datetime(),
});

export const updateValuationScheduleInputSchema = z.object({
  cadence: valuationScheduleCadenceSchema,
  enabled: z.boolean(),
});

export const valuationSnapshotSchema = z.object({
  id: uuidSchema,
  assetId: uuidSchema,
  reportId: uuidSchema.nullable(),
  currency: currencyCodeSchema,
  valueMinor: nonNegativeMinorUnitSchema,
  lowMinor: nonNegativeMinorUnitSchema.nullable(),
  highMinor: nonNegativeMinorUnitSchema.nullable(),
  confidence: valuationConfidenceSchema.nullable(),
  valuedOn: isoDateSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const valuationAnalyticsSchema = z.object({
  snapshots: z.array(valuationSnapshotSchema),
  annualizedDepreciationRate: z.number().nullable(),
  latestForecasts: z.array(valuationForecastSegmentSchema),
  notes: z.array(z.string()),
});

export const valuationPreviewSchema = z.object({
  outboundSummary: valuationOutboundSummarySchema,
  providers: z.object({
    searchConfigured: z.boolean(),
    aiConfigured: z.boolean(),
    searchProvider: z.string().nullable(),
    aiProvider: z.string().nullable(),
    aiProtocol: valuationAiProtocolSchema.nullable(),
    aiModel: z.string().nullable(),
  }),
  notes: z.array(z.string()),
});

export const runValuationInputSchema = z.object({
  /** Caller must have reviewed the outbound summary. */
  confirmOutboundSummary: z.literal(true),
});

export const confirmValuationInputSchema = z.object({
  /** Optional override of adopted mid value; defaults to report mid. */
  valueMinor: nonNegativeMinorUnitSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const valuationReportListSchema = z.object({
  items: z.array(valuationReportSchema),
});

export const valuationSnapshotListSchema = z.object({
  items: z.array(valuationSnapshotSchema),
});

export const confirmValuationResultSchema = z.object({
  report: valuationReportSchema,
  snapshot: valuationSnapshotSchema,
});

export type ValuationConfidence = z.infer<typeof valuationConfidenceSchema>;
export type ValuationReportStatus = z.infer<typeof valuationReportStatusSchema>;
export type ValuationAiProtocol = z.infer<typeof valuationAiProtocolSchema>;
export type ValuationEvidence = z.infer<typeof valuationEvidenceSchema>;
export type ValuationForecastSegment = z.infer<typeof valuationForecastSegmentSchema>;
export type ValuationOutboundSummary = z.infer<typeof valuationOutboundSummarySchema>;
export type ValuationReport = z.infer<typeof valuationReportSchema>;
export type ValuationSnapshot = z.infer<typeof valuationSnapshotSchema>;
export type ValuationPreview = z.infer<typeof valuationPreviewSchema>;
export type RunValuationInput = z.infer<typeof runValuationInputSchema>;
export type ConfirmValuationInput = z.infer<typeof confirmValuationInputSchema>;
export type ConfirmValuationResult = z.infer<typeof confirmValuationResultSchema>;
export type ValuationScheduleCadence = z.infer<typeof valuationScheduleCadenceSchema>;
export type ValuationTriggerSource = z.infer<typeof valuationTriggerSourceSchema>;
export type ValuationSchedule = z.infer<typeof valuationScheduleSchema>;
export type UpdateValuationScheduleInput = z.infer<
  typeof updateValuationScheduleInputSchema
>;
export type ValuationAnalytics = z.infer<typeof valuationAnalyticsSchema>;
