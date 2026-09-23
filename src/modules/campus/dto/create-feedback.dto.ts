import { IsIn, IsString, MinLength } from 'class-validator';

const CATEGORIES = ['FACILITIES', 'FOOD', 'TRANSPORT', 'SAFETY', 'OTHER'];

export class CreateFeedbackDto {
  @IsIn(CATEGORIES)
  category!: string;

  @IsString()
  @MinLength(3)
  message!: string;
}
