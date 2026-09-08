import { IsOptional, IsString, MinLength } from 'class-validator';

// Outcome is optional -- "record the final outcome where required" (Phase 7's
// own wording), not mandatory for every activity.
export class CompleteInitiativeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  outcome?: string;
}
