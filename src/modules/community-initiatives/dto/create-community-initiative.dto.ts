import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

// No communityId here either -- same reasoning as CreateCommunityProposalDto:
// ownership is resolved server-side, never trusted from the client. Only
// proposalId is client-supplied; the service validates it belongs to the
// caller's own authorized community AND is APPROVED before creating anything.
//
// venue (Phase 13): same optional free-text field the sibling Admin-owned
// community_activity already uses for its own scheduling (create-activity.dto.ts) --
// not a new field invented for this module.
export class CreateCommunityInitiativeDto {
  @IsUUID()
  proposalId!: string;

  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @IsOptional()
  @IsString()
  venue?: string;
}
