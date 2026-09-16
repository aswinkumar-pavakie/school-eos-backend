import { IsString, MinLength } from 'class-validator';

export class SendBackMarksSubmissionDto {
  @IsString()
  @MinLength(3)
  comment!: string;
}
