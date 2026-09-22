import { IsBoolean, IsString, MinLength } from 'class-validator';

export class MuteParticipantDto {
  @IsString()
  @MinLength(1)
  identity!: string;

  @IsBoolean()
  muted!: boolean;
}
