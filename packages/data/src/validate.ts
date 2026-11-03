/**
 * Validation entry point ("@open-tariff-india/data/schema"). Used by the build script,
 * CI, and anyone checking a hand-edited tariff file.
 */
import type { z } from 'zod';
import { NationalFileSchema, SolarResourceFileSchema, TariffBookSchema } from './schema.js';
import type { NationalFile, SolarResourceFile, TariffBook } from './types.js';

export * from './schema.js';

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

function validateWith<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, errors: formatIssues(result.error) };
}

export function validateBook(input: unknown): ValidationResult<TariffBook> {
  return validateWith(TariffBookSchema as z.ZodType<TariffBook>, input);
}

export function validateSolarResourceFile(input: unknown): ValidationResult<SolarResourceFile> {
  return validateWith(SolarResourceFileSchema as z.ZodType<SolarResourceFile>, input);
}

export function validateNationalFile(input: unknown): ValidationResult<NationalFile> {
  return validateWith(NationalFileSchema as z.ZodType<NationalFile>, input);
}
