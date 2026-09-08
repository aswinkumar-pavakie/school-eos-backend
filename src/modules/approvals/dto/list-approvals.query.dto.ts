import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListApprovalsQueryDto {
  @IsOptional()
  @IsString()
  requestType?: string;

  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
