import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class TransferEnrolmentDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rollNo?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
