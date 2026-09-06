import { IsNotEmpty, IsString } from 'class-validator';

export class SuspendMemberDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
