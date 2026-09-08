import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateTerminalDto } from './dto/create-terminal.dto';
import { UpdateTerminalDto } from './dto/update-terminal.dto';
import { TerminalsService } from './terminals.service';

@Roles('ADMIN')
@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Get()
  async list() {
    return { data: await this.terminalsService.list() };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.terminalsService.get(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateTerminalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.terminalsService.create(dto, actor.personId) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTerminalDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return {
      data: await this.terminalsService.update(id, dto, actor.personId),
    };
  }
}
