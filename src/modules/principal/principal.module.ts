import { Module } from '@nestjs/common';
import { PrincipalDashboardController } from './principal-dashboard.controller';
import { PrincipalDashboardService } from './principal-dashboard.service';

@Module({
  controllers: [PrincipalDashboardController],
  providers: [PrincipalDashboardService],
})
export class PrincipalModule {}
