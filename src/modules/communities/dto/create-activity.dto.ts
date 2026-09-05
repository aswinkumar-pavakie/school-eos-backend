import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  venue?: string;
}
