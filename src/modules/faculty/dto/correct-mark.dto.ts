import { IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CorrectMarkDto {
  @IsUUID()
  studentId!: string;

  @IsNumber()
  @Min(0)
  newMarksObtained!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
