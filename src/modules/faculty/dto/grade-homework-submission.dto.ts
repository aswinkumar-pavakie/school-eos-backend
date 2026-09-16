import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// A teacher marking a submission complete/not-complete themselves (e.g. the
// student handed in physical work, or the class was checked verbally) --
// distinct from SUBMITTED, which the Parent/Student app sets when a family
// submits through the app. GRADED additionally carries marks/feedback.
const STATUSES = ['NOT_DONE', 'SUBMITTED', 'GRADED'];

export class GradeHomeworkSubmissionDto {
  @IsIn(STATUSES)
  status!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  marksAwarded?: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
