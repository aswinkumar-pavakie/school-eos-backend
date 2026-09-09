import { IsObject, IsOptional, IsString } from 'class-validator';

export class ResubmitApprovalRequestDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsObject()
  actionPayload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  comment?: string;
}
