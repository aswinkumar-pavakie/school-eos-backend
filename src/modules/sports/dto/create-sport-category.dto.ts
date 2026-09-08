import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSportCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  ageGroup?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  gender?: string;
}
