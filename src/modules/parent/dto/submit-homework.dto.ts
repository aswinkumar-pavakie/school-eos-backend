import { IsOptional, IsString } from 'class-validator';

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  note?: string;
}
