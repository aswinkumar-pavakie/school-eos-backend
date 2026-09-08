import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WaiveObligationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
