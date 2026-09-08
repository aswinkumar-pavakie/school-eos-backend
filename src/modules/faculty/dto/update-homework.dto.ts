import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

const STATUSES = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];

export class UpdateHomeworkDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  attachmentKeys?: string[];

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;
}
