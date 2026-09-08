import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

// Deliberately no communityId/proposalId/createdBy/status fields -- those stay
// immutable after creation (Phase 9's own requirement). Only the plain
// informational fields a Community user might reasonably need to correct
// before the activity actually starts. Enforced server-side (PLANNED only),
// not just omitted from this DTO -- see CommunityInitiativesService.update.
export class UpdateCommunityInitiativeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  venue?: string;
}
