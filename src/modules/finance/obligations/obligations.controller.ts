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
import { CreateObligationDto } from './dto/create-obligation.dto';
import { ListObligationsQueryDto } from './dto/list-obligations.query.dto';
import { UpdateObligationDto } from './dto/update-obligation.dto';
import { WaiveObligationDto } from './dto/waive-obligation.dto';
import { ObligationsService } from './obligations.service';

@Controller('finance/obligations')
@Roles('FINANCE', 'ADMIN')
export class ObligationsController {
  constructor(private readonly service: ObligationsService) {}

  @Get()
  async list(@Query() query: ListObligationsQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateObligationDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateObligationDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }

  @Post(':id/waive')
  @HttpCode(HttpStatus.OK)
  async waive(
    @Param('id') id: string,
    @Body() dto: WaiveObligationDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.waive(id, actor, dto.reason);
    return { data };
  }
}
