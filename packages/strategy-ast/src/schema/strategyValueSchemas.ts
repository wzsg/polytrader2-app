import { z } from 'zod';

const canonicalDecimalPattern = /^(?:0|-?[1-9]\d*|-?(?:0|[1-9]\d*)\.\d*[1-9])$/;
const canonicalDecimalStringSchema = z
  .string()
  .max(256)
  .regex(canonicalDecimalPattern, 'Expected a canonical decimal string');
const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/, 'Expected a stable identifier');
const timestampStringSchema = z
  .string()
  .max(64)
  .datetime({ offset: true, precision: 3 })
  .refine((value) => Number.isFinite(Date.parse(value)), 'Expected a valid timestamp');

export {
  canonicalDecimalPattern,
  canonicalDecimalStringSchema,
  identifierSchema,
  timestampStringSchema,
};
