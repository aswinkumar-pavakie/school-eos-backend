import { IsUUID } from 'class-validator';

export class SubjectOfferingQueryDto {
  @IsUUID()
  sectionId!: string;
}
