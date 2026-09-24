import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/trim';

export class OptionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

// A question is always saved together with all of its options, so a question can never
// exist half-built (e.g. with no correct answer). "Exactly one correct option" and
// "no duplicate option texts" are checked in TeacherQuizzesService.
export class QuestionDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  points!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options!: OptionDto[];
}
