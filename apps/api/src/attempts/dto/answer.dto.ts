import { IsUUID } from 'class-validator';

export class AnswerDto {
  @IsUUID()
  optionId!: string;
}
