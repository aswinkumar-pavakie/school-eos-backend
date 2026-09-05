import { IsIn, IsString } from 'class-validator';

export class BlockIdCardDto {
  @IsIn(['LOST', 'DAMAGED', 'BLOCKED'])
  status!: string;

  @IsString()
  blockedReason!: string;
}
