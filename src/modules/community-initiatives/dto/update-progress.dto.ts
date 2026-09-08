import { IsString, MinLength } from 'class-validator';

export class UpdateProgressDto {
  @IsString()
  @MinLength(1)
  progressNotes!: string;
}
