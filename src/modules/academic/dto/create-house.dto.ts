import {
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateHouseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsHexColor()
  colourHex?: string;

  @IsOptional()
  @IsUUID()
  captainStudentId?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}
