import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateSchema,
  signedMinorUnitSchema,
  uuidSchema,
} from './common.js';

export const trendPeriodLimits = { min: 7, max: 3650 } as const;

export const dashboardQuerySchema = z.object({
  periodDays: z.coerce
    .number()
    .int()
    .min(trendPeriodLimits.min)
    .max(trendPeriodLimits.max)
    .default(30),
});

export const dashboardCategorySchema = z.object({
  categoryId: uuidSchema,
  name: z.string(),
  color: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  netCostMinor: signedMinorUnitSchema,
  dailyCostMinor: z.string(),
  holdingDailyCostMinor: z.string(),
});

export const dashboardTrendPointSchema = z.object({
  date: isoDateSchema,
  dailyCostMinor: z.string(),
  holdingDailyCostMinor: z.string(),
  netInvestmentMinor: signedMinorUnitSchema,
  activeItemCount: z.number().int().nonnegative(),
  heldItemCount: z.number().int().nonnegative(),
});

export const dashboardAssetInsightSchema = z.object({
  assetId: uuidSchema,
  name: z.string(),
  categoryName: z.string(),
  categoryColor: z.string().nullable(),
  statusCode: z.string(),
  statusName: z.string(),
  netCostMinor: signedMinorUnitSchema.nullable(),
  holdingDailyCostMinor: z.string().nullable(),
  serviceDailyCostMinor: z.string().nullable(),
  holdingDays: z.number().int().positive(),
  serviceDays: z.number().int().nonnegative(),
});

export const recentActivityTypeSchema = z.enum([
  'asset_created',
  'lifecycle_changed',
  'financial_recorded',
  'condition_recorded',
  'loan_started',
  'loan_returned',
  'repair_started',
  'repair_completed',
]);

export const recentActivitySchema = z.object({
  id: z.string(),
  type: recentActivityTypeSchema,
  assetId: uuidSchema,
  assetName: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  occurredOn: isoDateSchema,
  createdAt: z.iso.datetime(),
});

export const dashboardReminderSchema = z.object({
  id: uuidSchema,
  reminderId: uuidSchema,
  title: z.string(),
  assetId: uuidSchema.nullable(),
  assetName: z.string().nullable(),
  dueAt: z.iso.datetime(),
  timeZone: z.string(),
  taskMode: z.enum(['notification', 'actionable']),
});

export const dashboardSchema = z.object({
  asOfDate: isoDateSchema,
  baseCurrency: currencyCodeSchema,
  periodDays: z.number().int().positive(),
  currentDailyCostMinor: z.string(),
  currentHoldingDailyCostMinor: z.string(),
  currentNetInvestmentMinor: signedMinorUnitSchema,
  adoptedValuationMinor: signedMinorUnitSchema.nullable(),
  valuedNetInvestmentMinor: signedMinorUnitSchema.nullable(),
  valuationDeltaMinor: signedMinorUnitSchema.nullable(),
  valuedItemCount: z.number().int().nonnegative(),
  valuationCoveragePercent: z.number().min(0).max(100),
  periodSpendingMinor: signedMinorUnitSchema,
  periodInflowMinor: signedMinorUnitSchema,
  periodNetSpendingMinor: signedMinorUnitSchema,
  heldItemCount: z.number().int().nonnegative(),
  serviceItemCount: z.number().int().nonnegative(),
  totalItemCount: z.number().int().nonnegative(),
  unknownCostCount: z.number().int().nonnegative(),
  dataCompletenessPercent: z.number().min(0).max(100),
  idleCount: z.number().int().nonnegative(),
  loanedCount: z.number().int().nonnegative(),
  repairCount: z.number().int().nonnegative(),
  retiredCount: z.number().int().nonnegative(),
  categories: z.array(dashboardCategorySchema),
  trend: z.array(dashboardTrendPointSchema),
  assetRankings: z.object({
    highestHoldingDailyCost: z.array(dashboardAssetInsightSchema).max(5),
    longestHeld: z.array(dashboardAssetInsightSchema).max(5),
  }),
  recentActivity: z.array(recentActivitySchema),
  upcomingReminders: z.array(dashboardReminderSchema),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardAssetInsight = z.infer<typeof dashboardAssetInsightSchema>;
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;
export type RecentActivity = z.infer<typeof recentActivitySchema>;
