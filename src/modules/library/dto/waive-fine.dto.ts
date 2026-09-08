import { IsNotEmpty, IsString } from 'class-validator';

export class WaiveFineDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
