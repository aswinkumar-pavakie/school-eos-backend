import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

export class CreateHomeworkDto {
  @IsUUID()
  subjectOfferingId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  dueDate!: string;

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
}
