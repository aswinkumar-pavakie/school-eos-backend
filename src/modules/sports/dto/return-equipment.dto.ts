import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReturnEquipmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  conditionOnReturn?: string;
}
