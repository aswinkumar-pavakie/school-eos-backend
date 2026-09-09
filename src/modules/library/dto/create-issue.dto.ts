import { IsUUID } from 'class-validator';

export class CreateIssueDto {
  @IsUUID()
  copyId!: string;

  @IsUUID()
  memberId!: string;
}
