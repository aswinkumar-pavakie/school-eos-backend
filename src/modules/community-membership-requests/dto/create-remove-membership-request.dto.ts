import { IsString, MinLength } from 'class-validator';

// membershipId identifies an existing community_membership row -- the
// service verifies it belongs to the caller's own authorized community before
// accepting it, exactly like every other Community object-level check in
// this codebase (never trusts the client past validation shape).
export class CreateRemoveMembershipRequestDto {
  @IsString()
  @MinLength(1)
  membershipId!: string;
}
