import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ReservationQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED'])
  status?: string;

  @IsOptional()
  @IsUUID()
  bookId?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  /** Member name or book title, case-insensitive -- same convention as
   * Circulation's own issue search. */
  @IsOptional()
  @IsString()
  search?: string;
}
