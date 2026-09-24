import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../common/trim';

// Dates must carry an explicit timezone ("Z" or "+03:00"). Without one, "09:00" would be
// interpreted in the server's timezone, which may not be Amman's.
const WITH_TIMEZONE = /(Z|[+-]\d{2}:\d{2})$/;
const TIMEZONE_MESSAGE =
  '$property must include a timezone, e.g. 2026-10-01T09:00:00+03:00';

const MAX_TIME_LIMIT_MINUTES = 300;

export class CreateQuizDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsISO8601({ strict: true })
  @Matches(WITH_TIMEZONE, { message: TIMEZONE_MESSAGE })
  opensAt!: string;

  @IsISO8601({ strict: true })
  @Matches(WITH_TIMEZONE, { message: TIMEZONE_MESSAGE })
  closesAt!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_TIME_LIMIT_MINUTES)
  timeLimitMinutes!: number;

  // Percentage of a question's points lost for a wrong answer. Omitted = 0 (off).
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  negativeMarkPercent?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds!: string[];
}

// Every field is optional, but a field that is sent must be valid. @ValidateIf (rather than
// @IsOptional) is used for columns that can't be null, so `"title": null` is a 400, not a 500.
const isSent = (_: object, value: unknown) => value !== undefined;

export class UpdateQuizDto {
  @ValidateIf(isSent)
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional() // null clears the description
  @Trim()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ValidateIf(isSent)
  @IsISO8601({ strict: true })
  @Matches(WITH_TIMEZONE, { message: TIMEZONE_MESSAGE })
  opensAt?: string;

  @ValidateIf(isSent)
  @IsISO8601({ strict: true })
  @Matches(WITH_TIMEZONE, { message: TIMEZONE_MESSAGE })
  closesAt?: string;

  @ValidateIf(isSent)
  @IsInt()
  @Min(1)
  @Max(MAX_TIME_LIMIT_MINUTES)
  timeLimitMinutes?: number;

  @ValidateIf(isSent)
  @IsInt()
  @Min(0)
  @Max(100)
  negativeMarkPercent?: number;

  @ValidateIf(isSent)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds?: string[];
}
