import { IsUrl } from 'class-validator';

export class AddRecordingDto {
  @IsUrl({ require_protocol: true })
  recordingUrl!: string;
}
