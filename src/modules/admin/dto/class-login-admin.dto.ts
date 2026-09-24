import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ListClassLoginsQueryDto {
  // Which academic year the seat table is judged against (student counts,
  // "needs rollover" ...). Defaults to the current year.
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class SetClassLoginPasswordDto {
  // Omitted = the server generates a strong one. Either way it is shown to the
  // admin once and stays readable on the seat's credentials panel.
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}

export class RolloverOverrideDto {
  @IsUUID()
  loginPersonId!: string;
  @IsUUID()
  facultyPersonId!: string;
}

export class RolloverClassLoginsDto {
  @IsUUID()
  targetAcademicYearId!: string;
  // Change every moved login's password too (default false -- the default is
  // "same teacher, same login, next year").
  @IsOptional()
  @IsBoolean()
  rotatePasswords?: boolean;
  // Seats whose teacher changes at rollover; every other seat keeps its holder.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RolloverOverrideDto)
  overrides?: RolloverOverrideDto[];
}
