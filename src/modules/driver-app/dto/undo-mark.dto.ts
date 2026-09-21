import { IsIn, IsUUID } from 'class-validator';

export class UndoMarkDto {
  @IsUUID('4')
  studentId!: string;

  @IsIn(['PICKUP', 'DROP'])
  direction!: 'PICKUP' | 'DROP';
}
