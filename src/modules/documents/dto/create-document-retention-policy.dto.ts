import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDocumentRetentionPolicyDto {
  @IsString()
  category!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionYears?: number;

  @IsIn(['CREATED_DATE', 'LEAVING_DATE', 'EXIT_DATE'])
  anchor!: string;

  @IsOptional()
  @IsBoolean()
  isPermanent?: boolean;

  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;
}
