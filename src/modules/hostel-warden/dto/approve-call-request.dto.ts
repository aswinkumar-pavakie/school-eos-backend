import { IsDateString } from 'class-validator';

export class ApproveCallRequestDto {
  @IsDateString()
  approvedFrom!: string;

  @IsDateString()
  approvedTo!: string;
}
