import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateHostelRoomDto {
  @IsString()
  @MinLength(1)
  roomNo!: string;

  @IsOptional()
  @IsString()
  roomType?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedCapacity!: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE'])
  status?: string;
}
