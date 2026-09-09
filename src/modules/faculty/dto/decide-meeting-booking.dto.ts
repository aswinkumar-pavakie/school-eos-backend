import { IsIn } from 'class-validator';

export class DecideMeetingBookingDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';
}
