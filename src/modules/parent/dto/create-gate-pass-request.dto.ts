import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGatePassRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  outFrom!: string;

  @IsDateString()
  expectedReturn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}
