import { Transform } from 'class-transformer';

// Strips surrounding whitespace before validation, so "   " fails @IsNotEmpty().
export const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
