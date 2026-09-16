import { IsUUID } from 'class-validator';

export class FacultyFeesQueryDto {
  @IsUUID()
  sectionId!: string;
}
