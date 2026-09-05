import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Plain field edit only -- section_id is intentionally not editable here.
// Changing section goes through POST /enrolments/:id/transfer instead, which
// keeps the previous section as real history rather than overwriting it.
export class UpdateEnrolmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  rollNo?: number;

  @IsOptional()
  @IsIn(['ACTIVE', 'TRANSFERRED_SECTION', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsIn(['PROMOTED', 'DETAINED', 'LEFT', 'PENDING'])
  outcome?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
