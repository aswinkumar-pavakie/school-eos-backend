import { Global, Module } from '@nestjs/common';
import { UnitOfWork } from '../../common/transactions/unit-of-work';
import { PostgresService } from './postgres.service';

@Global()
@Module({
  providers: [PostgresService, UnitOfWork],
  exports: [PostgresService, UnitOfWork],
})
export class PostgresModule {}
