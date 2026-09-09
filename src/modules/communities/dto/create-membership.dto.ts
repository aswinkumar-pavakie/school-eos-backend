import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMembershipDto {
  @IsString()
  @MinLength(1)
  studentId!: string;

  @IsOptional()
  @IsIn(['MEMBER', 'LEAD'])
  roleInCommunity?: string;
}
