import { IsDateString, IsUUID } from 'class-validator';

export class CreateCallRequestDto {
  @IsUUID()
  studentId!: string;

  @IsDateString()
  requestedFrom!: string;

  @IsDateString()
  requestedTo!: string;
}
