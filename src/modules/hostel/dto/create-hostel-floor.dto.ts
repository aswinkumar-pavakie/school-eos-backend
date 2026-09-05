import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class CreateHostelFloorDto {
  @Type(() => Number)
  @IsInt()
  floorNo!: number;
}
