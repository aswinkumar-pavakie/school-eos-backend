import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// The design system is explicit and absolute here ("Reject always demands a reason" —
// component #23 of the shared component library) — unlike approve, reject's comment is
// required, not optional.
export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;
}
