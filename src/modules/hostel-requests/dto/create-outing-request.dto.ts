import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// Shared by both Gate Pass and Emergency Exit (see school-eos-mobile's own
// ParentOutingRequestScreen.tsx comment: "both create an outing_request on
// the backend with near-identical fields") -- the actual request_type is set
// by which controller route is called, never trusted from the client body.
export class CreateOutingRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  outFrom!: string;

  @IsDateString()
  expectedReturn!: string;

  @IsString()
  @MinLength(3)
  reason!: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}
