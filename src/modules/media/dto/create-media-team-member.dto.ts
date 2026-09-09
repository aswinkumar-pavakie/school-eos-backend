import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateMediaTeamMemberDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  // Set only when this crew member genuinely is a real staff/faculty person
  // elsewhere in the system -- optional because a shoot's crew commonly includes
  // students or short-term help with no system login at all.
  @IsOptional()
  @IsUUID()
  personId?: string;
}
