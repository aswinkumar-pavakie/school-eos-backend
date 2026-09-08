import { IsDateString, IsIn, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

const CARD_TECHS = ['DESFIRE_EV2', 'DESFIRE_EV3', 'NTAG424_DNA', 'MIFARE_CLASSIC', 'NTAG213'];

export class CreateIdCardDto {
  @IsString()
  cardUid!: string;

  @IsOptional()
  @IsIn(CARD_TECHS)
  cardTech?: string;

  @IsIn(['STUDENT', 'STAFF'])
  holderType!: string;

  @ValidateIf((o) => o.holderType === 'STUDENT')
  @IsUUID()
  studentId?: string;

  @ValidateIf((o) => o.holderType === 'STAFF')
  @IsUUID()
  staffId?: string;

  @IsOptional()
  @IsDateString()
  issuedOn?: string;

  @IsOptional()
  @IsString()
  printBatch?: string;
}
