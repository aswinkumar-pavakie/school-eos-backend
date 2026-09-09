import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateSportCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  gender?: string;
}
