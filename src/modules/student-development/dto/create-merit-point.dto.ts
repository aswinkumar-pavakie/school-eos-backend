import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateMeritPointDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsUUID()
  houseId?: string;

  // A real, positive-only scale -- merit points are awarded, never docked, in
  // this schema (points is a plain smallint with no CHECK constraint, but the
  // real seeded data is uniformly 2-10 per award; docking would be a
  // discipline incident instead, a separate table). Capped at 20 -- double
  // the real observed max -- rather than the column's full smallint range, so
  // a typo can't silently create an absurd award.
  @IsInt()
  @Min(1)
  @Max(20)
  points!: number;

  @IsString()
  @MaxLength(300)
  reason!: string;
}
