import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// No communityId here -- same reasoning as every other Community write DTO in
// this codebase: ownership is resolved server-side from the authenticated
// Community user's own role_assignment scope, never trusted from the client.
// studentId validation matches the sibling Admin-owned CreateMembershipDto
// (communities/dto/create-membership.dto.ts) exactly -- same field, same rules.
export class CreateAddMembershipRequestDto {
  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsOptional()
  @IsIn(['MEMBER', 'LEAD'])
  roleInCommunity?: string;
}
