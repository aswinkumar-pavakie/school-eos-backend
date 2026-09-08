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
} from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { GradeScalesService } from './grade-scales.service';
import { CreateGradeScaleDto } from './dto/create-grade-scale.dto';
import { UpdateGradeScaleDto } from './dto/update-grade-scale.dto';
import { CreateGradeBandDto } from './dto/create-grade-band.dto';
import { UpdateGradeBandDto } from './dto/update-grade-band.dto';

@Roles('ADMIN')
@Controller()
export class GradeScalesController {
  constructor(private readonly gradeScalesService: GradeScalesService) {}

  @Get('grade-scales')
  async list() {
    return { data: await this.gradeScalesService.list() };
  }

  @Get('grade-scales/:id')
  async get(@Param('id') id: string) {
    return { data: await this.gradeScalesService.get(id) };
  }

  @Post('grade-scales')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateGradeScaleDto, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.gradeScalesService.create(dto, actor.personId) };
  }

  @Patch('grade-scales/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGradeScaleDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradeScalesService.update(id, dto, actor.personId) };
  }

  @Post('grade-scales/:id/set-default')
  @HttpCode(HttpStatus.OK)
  async setDefault(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    return { data: await this.gradeScalesService.setDefault(id, actor.personId) };
  }

  @Get('grade-scales/:id/bands')
  async listBands(@Param('id') id: string) {
    return { data: await this.gradeScalesService.listBands(id) };
  }

  @Post('grade-scales/:id/bands')
  @HttpCode(HttpStatus.CREATED)
  async createBand(
    @Param('id') id: string,
    @Body() dto: CreateGradeBandDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradeScalesService.createBand(id, dto, actor.personId) };
  }

  @Patch('grade-bands/:bandId')
  async updateBand(
    @Param('bandId') bandId: string,
    @Body() dto: UpdateGradeBandDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    return { data: await this.gradeScalesService.updateBand(bandId, dto, actor.personId) };
  }

  @Delete('grade-bands/:bandId')
  @HttpCode(HttpStatus.OK)
  async deleteBand(@Param('bandId') bandId: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.gradeScalesService.deleteBand(bandId, actor.personId);
    return { data: { deleted: true } };
  }
}
