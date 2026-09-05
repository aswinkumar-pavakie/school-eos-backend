import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateRefundDto {
  @IsUUID()
  studentId!: string;

  @Matches(/^[1-9][0-9]*$/, { message: 'amountPaise must be a positive integer string' })
  amountPaise!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
