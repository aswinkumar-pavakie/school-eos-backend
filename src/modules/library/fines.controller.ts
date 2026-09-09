import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { FineQueryDto } from './dto/fine-query.dto';
import { WaiveFineDto } from './dto/waive-fine.dto';
import { FinesService } from './fines.service';

// Shared by three roles: Library assesses/manages fines, Admin has oversight,
// Finance reads the exact same rows (read-only here) rather than a second copy
// of this data living in Finance's own module.
@Controller('library/fines')
@Roles('LIBRARY', 'ADMIN', 'FINANCE')
export class FinesController {
  constructor(private readonly finesService: FinesService) {}

  @Get()
  async list(@Query() query: FineQueryDto) {
    return this.finesService.list(query);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return { data: await this.finesService.get(id) };
  }

  @Post(':id/send-to-finance')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async sendToFinance(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.finesService.sendToFinance(id, actor.personId) };
  }

  @Post(':id/refresh-status')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async refreshStatus(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.finesService.refreshStatus(id, actor.personId) };
  }

  @Post(':id/waive')
  @HttpCode(HttpStatus.OK)
  @Roles('LIBRARY')
  async waive(@Param('id') id: string, @Body() dto: WaiveFineDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.finesService.waive(id, dto, actor.personId) };
  }
}
