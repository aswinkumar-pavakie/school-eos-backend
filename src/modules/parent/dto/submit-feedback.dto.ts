import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class SubmitFeedbackDto {
  @IsUUID()
  subjectOfferingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
