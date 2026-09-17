// Media Room "Report" scorecard -- a real, user-curated CRUD table
// (media_report_metric), not computed analytics. See
// database/migrations/0018_media_report_metrics.sql and this feature's own
// repository header comment for why: the design's own New-metric form takes
// plain free-text name/now/target/pct values with no calculation behind
// them.

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateMediaReportMetricDto } from './dto/create-media-report-metric.dto';
import { UpdateMediaReportMetricDto } from './dto/update-media-report-metric.dto';
import { MediaReportMetricRepository } from './repositories/media-report-metric.repository';

class ListMetricsQueryDto {
  @IsUUID()
  academicYearId!: string;
}

@Roles('MEDIA_ROOM', 'ADMIN', 'PRINCIPAL')
@Controller('media/report-metrics')
export class MediaReportController {
  constructor(private readonly repo: MediaReportMetricRepository) {}

  @Get()
  async list(@Query() query: ListMetricsQueryDto) {
    return { data: await this.repo.findMany(query.academicYearId) };
  }

  @Post()
  @Roles('MEDIA_ROOM')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMediaReportMetricDto, @CurrentActor() actor: AuthenticatedUser) {
    return {
      data: await this.repo.create({
        academicYearId: dto.academicYearId,
        name: dto.name,
        nowValue: dto.nowValue,
        targetValue: dto.targetValue ?? null,
        attainmentPct: dto.attainmentPct ?? null,
        createdBy: actor.personId,
      }),
    };
  }

  // A user-curated scorecard row -- only the Media Room person who created it
  // may edit or remove it (same restriction as create() above), never
  // another department's or a stale value someone else typed in.
  private async assertOwnedByActor(id: string, actor: AuthenticatedUser) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('Report metric not found');
    if (existing.createdBy !== actor.personId) {
      throw new ForbiddenException('You can only edit or delete metrics you created.');
    }
    return existing;
  }

  @Patch(':id')
  @Roles('MEDIA_ROOM')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaReportMetricDto,
    @CurrentActor() actor: AuthenticatedUser,
  ) {
    await this.assertOwnedByActor(id, actor);
    return {
      data: await this.repo.update(id, {
        name: dto.name,
        nowValue: dto.nowValue,
        targetValue: dto.targetValue,
        attainmentPct: dto.attainmentPct,
      }),
    };
  }

  @Delete(':id')
  @Roles('MEDIA_ROOM')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentActor() actor: AuthenticatedUser) {
    await this.assertOwnedByActor(id, actor);
    await this.repo.delete(id);
    return { data: { deleted: true } };
  }
}
