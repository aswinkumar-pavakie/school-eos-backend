import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';

export class MarkBoardingDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  studentIds!: string[];

  @IsIn(['PICKUP', 'DROP'])
  direction!: 'PICKUP' | 'DROP';
}
