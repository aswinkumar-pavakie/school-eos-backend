import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AddTeamMemberDto {
  @IsUUID()
  studentId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  jerseyNo?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  role?: string;
}
