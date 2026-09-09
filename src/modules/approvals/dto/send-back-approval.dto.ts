import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Mirrors RejectApprovalDto exactly -- send-back is also a "decision requires a
// reason" action per the same design-system rule reject.dto.ts already documents.
export class SendBackApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;
}
