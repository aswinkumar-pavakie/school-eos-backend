import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateCommunityDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  communityCategory!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  inchargeStaffId?: string;

  @IsString()
  @MinLength(1)
  academicYearId!: string;

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
