import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ADMIN_REQUEST_TYPES } from '../admin-request-types';

export class ApprovalRequestQueryDto {
  @IsOptional()
  @IsIn(ADMIN_REQUEST_TYPES)
  requestType?: string;

  // A named view, not a raw state -- "pending" also surfaces RESUBMITTED
  // requests (they're awaiting Admin's decision again too), and "history" is
  // every state with no filter at all.
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'sent_back', 'history'])
  view?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
