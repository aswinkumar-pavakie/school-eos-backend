import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdateMeritPointDto {
  @IsOptional()
  @IsUUID()
  houseId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  points?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
