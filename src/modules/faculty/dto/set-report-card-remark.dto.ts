import { IsString, MaxLength } from 'class-validator';

export class SetReportCardRemarkDto {
  @IsString()
  @MaxLength(2000)
  remark!: string;
}
