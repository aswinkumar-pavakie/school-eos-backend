import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class FeeTermQueryDto {
  @IsUUID()
  academicYearId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  instalmentNo!: number;
}
