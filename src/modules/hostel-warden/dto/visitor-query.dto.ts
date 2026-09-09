import { IsIn, IsOptional } from 'class-validator';

export class VisitorQueryDto {
  // 'open' = currently on-premises (exited_at IS NULL); omitted = full history.
  @IsOptional()
  @IsIn(['open'])
  status?: string;
}
