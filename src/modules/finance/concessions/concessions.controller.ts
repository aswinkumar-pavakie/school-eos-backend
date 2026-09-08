import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../common/auth/current-actor.decorator';
import { AuthenticatedUser } from '../../../common/auth/authenticated-user.interface';
import { Roles } from '../../../common/auth/roles.decorator';
import { ConcessionsService } from './concessions.service';
import { CreateConcessionDto } from './dto/create-concession.dto';
import { ListConcessionsQueryDto } from './dto/list-concessions.query.dto';
import { UpdateConcessionDto } from './dto/update-concession.dto';

@Controller('finance/concessions')
@Roles('FINANCE', 'ADMIN')
export class ConcessionsController {
  constructor(private readonly service: ConcessionsService) {}

  @Get()
  async list(@Query() query: ListConcessionsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateConcessionDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.create(dto, actor);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateConcessionDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }
}
