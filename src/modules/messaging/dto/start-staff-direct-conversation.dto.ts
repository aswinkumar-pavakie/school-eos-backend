import { IsUUID } from 'class-validator';

export class StartStaffDirectConversationDto {
  @IsUUID()
  facultyPersonId!: string;
}
