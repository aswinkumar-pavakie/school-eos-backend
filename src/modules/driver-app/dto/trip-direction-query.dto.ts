import { IsIn } from 'class-validator';

export class TripDirectionQueryDto {
  @IsIn(['PICKUP', 'DROP'])
  direction!: 'PICKUP' | 'DROP';
}
