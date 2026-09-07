import { IsString, MaxLength } from 'class-validator';

// Trim/empty/whitespace-only rejection happens in MessagingService, not here —
// class-validator's MinLength doesn't reject whitespace-only strings (matches the
// project's existing pattern of trimming in the service, e.g. ScheduleOnlineClassDto's
// topic). MaxLength is checked pre-trim, generous enough that trimming never turns a
// rejected message into an accepted one.
export class SendMessageDto {
  @IsString()
  @MaxLength(2000)
  message!: string;
}
