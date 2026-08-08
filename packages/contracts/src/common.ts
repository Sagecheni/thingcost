import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateSchema = z.iso.date();
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/u);
export const nonNegativeMinorUnitSchema = z.string().regex(/^(0|[1-9]\d*)$/u);
export const signedMinorUnitSchema = z.string().regex(/^-?(0|[1-9]\d*)$/u);

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
