import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateHostelBlockDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
