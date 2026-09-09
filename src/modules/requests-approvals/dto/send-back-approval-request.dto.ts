import { IsString, MinLength } from 'class-validator';

// The requester needs to know what to fix -- unlike a rejection or approval,
// a comment is mandatory here.
export class SendBackApprovalRequestDto {
  @IsString()
  @MinLength(1)
  comment!: string;
}
