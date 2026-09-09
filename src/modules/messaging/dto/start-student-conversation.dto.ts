import { IsUUID } from 'class-validator';

export class StartStudentConversationDto {
  @IsUUID()
  studentId!: string;
}
