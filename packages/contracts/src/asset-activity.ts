import { z } from 'zod';

import {
  currencyCodeSchema,
  isoDateSchema,
  nonNegativeMinorUnitSchema,
  uuidSchema,
} from './common.js';

export const conditionGradeSchema = z.enum(['new', 'like_new', 'good', 'fair', 'poor']);

export const defectTypeSchema = z.enum([
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

export const conditionDefectInputSchema = z.object({
  type: defectTypeSchema,
  description: z.string().trim().min(1).max(500),
});

export const conditionDefectSchema = conditionDefectInputSchema.extend({
  id: uuidSchema,
});

export const createConditionEventSchema = z.object({
  grade: conditionGradeSchema,
  observedOn: isoDateSchema,
  defects: z.array(conditionDefectInputSchema).max(20).default([]),
  note: z.string().trim().max(2_000).optional(),
});

export const conditionEventSchema = z.object({
  id: uuidSchema,
  grade: conditionGradeSchema,
  observedOn: isoDateSchema,
  defects: z.array(conditionDefectSchema),
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const createLoanSchema = z
  .object({
    borrower: z.string().trim().min(1).max(160),
    lentOn: isoDateSchema,
    dueOn: isoDateSchema.optional(),
    note: z.string().trim().max(2_000).optional(),
  })
  .refine((input) => !input.dueOn || input.dueOn >= input.lentOn, {
    path: ['dueOn'],
    message: '预计归还日期不能早于借出日期',
  });

export const returnLoanSchema = z.object({
  returnedOn: isoDateSchema,
  statusId: uuidSchema,
  note: z.string().trim().max(2_000).optional(),
});

export const loanSchema = z.object({
  id: uuidSchema,
  borrower: z.string(),
  lentOn: isoDateSchema,
  dueOn: isoDateSchema.nullable(),
  returnedOn: isoDateSchema.nullable(),
  note: z.string().nullable(),
  returnNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createRepairSchema = z
  .object({
    issue: z.string().trim().min(1).max(500),
    provider: z.string().trim().max(160).optional(),
    sentOn: isoDateSchema,
    costAmountMinor: z
      .string()
      .regex(/^[1-9]\d*$/u)
      .optional(),
    currency: currencyCodeSchema.optional(),
    exchangeRate: z
      .string()
      .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/u)
      .refine((value) => Number(value) > 0, '汇率必须大于零')
      .optional(),
    exchangeRateSource: z.enum(['manual', 'frankfurter']).optional(),
    exchangeRateDate: isoDateSchema.optional(),
    exchangeRateFallback: z.boolean().optional(),
    includeInNetCost: z.boolean().default(true),
    note: z.string().trim().max(2_000).optional(),
  })
  .superRefine((input, context) => {
    if (input.costAmountMinor && !input.currency) {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: '维修费用必须指定币种',
      });
    }
  });

export const completeRepairSchema = z.object({
  completedOn: isoDateSchema,
  statusId: uuidSchema,
  note: z.string().trim().max(2_000).optional(),
});

export const repairSchema = z.object({
  id: uuidSchema,
  issue: z.string(),
  provider: z.string().nullable(),
  sentOn: isoDateSchema,
  completedOn: isoDateSchema.nullable(),
  costFinancialEventId: uuidSchema.nullable(),
  costAmountMinor: nonNegativeMinorUnitSchema.nullable(),
  currency: currencyCodeSchema.nullable(),
  baseCostAmountMinor: nonNegativeMinorUnitSchema.nullable(),
  baseCurrency: currencyCodeSchema.nullable(),
  exchangeRate: z.string().nullable(),
  exchangeRateSource: z.enum(['manual', 'frankfurter', 'legacy']).nullable(),
  exchangeRateDate: isoDateSchema.nullable(),
  exchangeRateFallback: z.boolean().nullable(),
  includeInNetCost: z.boolean().nullable(),
  note: z.string().nullable(),
  completionNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DefectType = z.infer<typeof defectTypeSchema>;
export type CreateConditionEventInput = z.infer<typeof createConditionEventSchema>;
export type ConditionEvent = z.infer<typeof conditionEventSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type ReturnLoanInput = z.infer<typeof returnLoanSchema>;
export type Loan = z.infer<typeof loanSchema>;
export type CreateRepairInput = z.infer<typeof createRepairSchema>;
export type CompleteRepairInput = z.infer<typeof completeRepairSchema>;
export type Repair = z.infer<typeof repairSchema>;
