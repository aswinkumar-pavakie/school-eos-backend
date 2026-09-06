import { IsString, MinLength } from 'class-validator';

export class ReplyMediaPostCommentDto {
  @IsString()
  @MinLength(1)
  reply!: string;
}
