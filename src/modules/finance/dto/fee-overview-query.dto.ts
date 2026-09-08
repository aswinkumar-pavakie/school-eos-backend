import { IsOptional, IsUUID } from 'class-validator';

export class FeeOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}
