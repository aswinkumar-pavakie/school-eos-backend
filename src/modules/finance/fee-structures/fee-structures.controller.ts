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
import { CreateFeeStructureDto } from './dto/create-fee-structure.dto';
import { ListFeeStructuresQueryDto } from './dto/list-fee-structures.query.dto';
import { UpdateFeeStructureDto } from './dto/update-fee-structure.dto';
import { FeeStructuresService } from './fee-structures.service';

@Controller('finance/fee-structures')
@Roles('FINANCE', 'ADMIN')
export class FeeStructuresController {
  constructor(private readonly service: FeeStructuresService) {}

  @Get()
  async list(@Query() query: ListFeeStructuresQueryDto) {
    const { page, pageSize, ...filter } = query;
    const { rows, total } = await this.service.list(filter, { page, pageSize });
    return {
      data: rows,
      meta: { total, page: page ?? 1, pageSize: pageSize ?? 20 },
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateFeeStructureDto) {
    const data = await this.service.create(dto);
    return { data };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const data = await this.service.getById(id);
    return { data };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFeeStructureDto) {
    const data = await this.service.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('id') id: string,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    const data = await this.service.activate(id, actor);
    return { data };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    const data = await this.service.deactivate(id);
    return { data };
  }
}
