import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateHostelVisitorDto {
  @IsUUID()
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  visitorName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  idProofRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
