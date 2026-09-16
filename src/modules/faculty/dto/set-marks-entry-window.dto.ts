import { IsISO8601, IsOptional } from 'class-validator';

export class SetMarksEntryWindowDto {
  @IsOptional()
  @IsISO8601()
  opensAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;
}
