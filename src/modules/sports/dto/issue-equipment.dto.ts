import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

// A plain base64 PNG string, not multipart — same reasoning as
// SignPermissionRequestDto (React Native's Blob polyfill can't build a Blob
// from raw bytes), reused verbatim for the student's equipment-receipt signature.
export class IssueEquipmentDto {
  @ValidateIf((o) => !o.issuedToTeamId)
  @IsUUID()
  issuedToStudentId?: string;

  @ValidateIf((o) => !o.issuedToStudentId)
  @IsUUID()
  issuedToTeamId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueOn?: string;

  @IsString()
  @MinLength(1)
  signaturePngBase64!: string;
}
