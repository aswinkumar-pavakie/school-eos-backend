import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateHostelBedDto {
  @IsString()
  @MinLength(1)
  bedNo!: string;

  @IsOptional()
  @IsIn(['VACANT', 'OCCUPIED', 'BLOCKED'])
  status?: string;
}
