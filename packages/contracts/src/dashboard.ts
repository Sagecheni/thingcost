import { z } from 'zod';

import { isoDateSchema, signedMinorUnitSchema, uuidSchema } from './common.js';

export const dashboardCategorySchema = z.object({
  categoryId: uuidSchema,
  name: z.string(),
  color: z.string().nullable(),
  itemCount: z.number().int().nonnegative(),
  netCostMinor: signedMinorUnitSchema,
  dailyCostMinor: z.string(),
});

export const dashboardTrendPointSchema = z.object({
  date: isoDateSchema,
  dailyCostMinor: z.string(),
  netInvestmentMinor: signedMinorUnitSchema,
  activeItemCount: z.number().int().nonnegative(),
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
  periodDays: z.number().int().positive(),
  currentDailyCostMinor: z.string(),
  currentNetInvestmentMinor: signedMinorUnitSchema,
  adoptedValuationMinor: signedMinorUnitSchema.nullable(),
  valuedNetInvestmentMinor: signedMinorUnitSchema.nullable(),
  valuationDeltaMinor: signedMinorUnitSchema.nullable(),
  valuedItemCount: z.number().int().nonnegative(),
  valuationCoveragePercent: z.number().min(0).max(100),
  periodSpendingMinor: signedMinorUnitSchema,
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
  recentActivity: z.array(recentActivitySchema),
  upcomingReminders: z.array(dashboardReminderSchema),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;
export type RecentActivity = z.infer<typeof recentActivitySchema>;
