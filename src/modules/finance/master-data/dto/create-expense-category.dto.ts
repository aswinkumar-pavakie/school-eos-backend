import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @Matches(/^[0-9]+$/, {
    message: 'pettyLimitPaise must be a non-negative integer string',
  })
  pettyLimitPaise?: string;
}
