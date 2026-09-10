import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAiBotMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsIn(['NORMAL', 'SCHOOL'])
  category?: string;

  // One entry per tool the bot actually called to produce this message
  // ({name, args, resultText}, per the bot's own agent.js) -- kept as a
  // loosely-typed array here, not one DTO class per possible tool shape.
  @IsOptional()
  @IsArray()
  toolCalls?: unknown[];
}
