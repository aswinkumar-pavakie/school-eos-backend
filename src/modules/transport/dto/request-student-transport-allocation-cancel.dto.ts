import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestStudentTransportAllocationCancelDto {
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** A real display label the requester already sees on screen (e.g. the
   * student's name) -- carried through so Admin's approval inbox shows who
   * this request is about instead of a bare UUID. Never used for anything
   * authorization-relevant; the real studentId is resolved server-side from
   * the allocation row itself. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentLabel?: string;
}
