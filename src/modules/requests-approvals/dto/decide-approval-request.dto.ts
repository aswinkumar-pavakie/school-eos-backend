import { IsOptional, IsString } from 'class-validator';

export class DecideApprovalRequestDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
