import { IsString, MinLength } from 'class-validator';

// Deliberately no communityId here -- ownership is resolved server-side from
// the authenticated Community user's own role_assignment scope, never
// trusted from the client. See CommunityProposalsService.resolveAuthorizedCommunityId.
export class CreateCommunityProposalDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
