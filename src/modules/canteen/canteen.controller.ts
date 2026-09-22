// The Canteen counter login's whole surface: search for a student (the
// manual stand-in for an NFC card tap -- no reader is wired up yet, see
// canteen.repository.ts's own header comment), charge their wallet, and
// browse the sale history. CANTEEN_VENDOR only -- this role's entire
// purpose is this one counter workflow (see role.repository.ts's
// ROLE_MODULE_ACCESS: ['Finance & Fees (device, wallet sales only)']),
// same least-privilege precedent as BUS_ATTENDANT's own device-only scope.
//
// `charge` additionally carries CanteenRateLimitGuard (a real device
// credential moving real money should never be able to fire unboundedly
// fast) and captures IP/user-agent for the audit trail CanteenService
// writes on every attempt, same device-context pattern
// identity.controller.ts's own login endpoint already uses.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/authenticated-user.interface';
import { CurrentActor } from '../../common/auth/current-actor.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CanteenRateLimitGuard } from './canteen-rate-limit.guard';
import { CanteenService } from './canteen.service';
import { ChargeWalletDto } from './dto/charge-wallet.dto';

function deviceContextFrom(req: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? null,
    userAgent: Array.isArray(userAgent)
      ? (userAgent[0] ?? null)
      : (userAgent ?? null),
  };
}

@Roles('CANTEEN_VENDOR')
@Controller('canteen')
export class CanteenController {
  constructor(private readonly service: CanteenService) {}

  @Get('students/search')
  async search(@Query('query') query?: string) {
    return { data: await this.service.searchStudents(query ?? '') };
  }

  @Get('dashboard')
  async dashboard() {
    return { data: await this.service.getDashboard() };
  }

  @Post('charge')
  @UseGuards(CanteenRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async charge(
    @Body() dto: ChargeWalletDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return {
      data: await this.service.charge(dto, {
        personId: actor.personId,
        ...deviceContextFrom(req),
      }),
    };
  }

  @Get('history')
  async history(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '30', 10) || 30, 1),
      100,
    );
    const parsedOffset = Math.max(parseInt(offset ?? '0', 10) || 0, 0);
    return { data: await this.service.listHistory(parsedLimit, parsedOffset) };
  }
}
