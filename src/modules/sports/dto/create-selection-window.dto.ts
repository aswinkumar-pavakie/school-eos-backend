import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSelectionWindowDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsISO8601({ strict: true })
  opensOn!: string;

  @IsISO8601({ strict: true })
  closesOn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
