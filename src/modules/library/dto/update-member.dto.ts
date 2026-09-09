import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxBooksAllowed?: number;
}
