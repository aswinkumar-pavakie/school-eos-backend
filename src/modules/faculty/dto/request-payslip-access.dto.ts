import { IsOptional, IsString } from 'class-validator';

export class RequestPayslipAccessDto {
  @IsOptional()
  @IsString()
  note?: string;
}
