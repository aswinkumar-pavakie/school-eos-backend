import { IsString, MinLength } from 'class-validator';

export class CreateHostelBlockDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
