import { IsIn, IsOptional, IsString } from 'class-validator';

const CARD_TECHS = ['DESFIRE_EV2', 'DESFIRE_EV3', 'NTAG424_DNA', 'MIFARE_CLASSIC', 'NTAG213'];

export class ReissueIdCardDto {
  @IsString()
  cardUid!: string;

  @IsOptional()
  @IsIn(CARD_TECHS)
  cardTech?: string;

  @IsOptional()
  @IsString()
  printBatch?: string;
}
