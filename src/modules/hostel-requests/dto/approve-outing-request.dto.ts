import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveOutingRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
