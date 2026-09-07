import { IsOptional, IsString, MinLength } from 'class-validator';

// Revising a SENT_BACK proposal before resubmission -- both fields optional
// since a Community user may only need to change one of them per the
// reviewer's comment.
export class ResubmitCommunityProposalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;
}
