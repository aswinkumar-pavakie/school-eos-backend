import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ResolveDiscrepancyDto {
  @IsUUID()
  entryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  resolutionNote!: string;
}
