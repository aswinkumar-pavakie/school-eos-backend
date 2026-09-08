import { IsString, MaxLength, MinLength } from 'class-validator';

// Structural validation only (a plausible-looking language code) -- the actual
// supported-language allow-list check happens in TranslationService, so extending
// the list later never requires touching this DTO.
export class TranslateMessageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(10)
  targetLanguage!: string;
}
