import { ValidateBy } from 'class-validator';

// Postgres text can't store the NUL character (\u0000): the database would reject the query
// and the request would end as a 500. Refuse it here instead, as a 400.
export const NoNul = () =>
  ValidateBy({
    name: 'noNul',
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'string' || !value.includes('\0'),
      defaultMessage: () => '$property contains an invalid character',
    },
  });
