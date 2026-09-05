import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class UpdateHostelFloorDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  floorNo?: number;
}
