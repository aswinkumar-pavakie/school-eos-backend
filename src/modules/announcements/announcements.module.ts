import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementRepository } from './repositories/announcement.repository';

@Module({
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementRepository],
  exports: [AnnouncementsService, AnnouncementRepository],
})
export class AnnouncementsModule {}
