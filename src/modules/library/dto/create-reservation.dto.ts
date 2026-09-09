import { IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  bookId!: string;

  @IsUUID()
  memberId!: string;
}
