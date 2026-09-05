import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCommunityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  communityCategory?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  inchargeStaffId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxMembers?: number;

  @IsOptional()
  @IsBoolean()
  discussionEnabled?: boolean;

  @IsOptional()
  @IsIn(['OPEN', 'PRE_MODERATED', 'CLOSED'])
  moderationMode?: string;
}
