import { Controller, Post, Query } from '@nestjs/common';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  // POST /seed?reset=true
  @Post()
  async run(@Query('reset') reset?: string) {
    const doReset = reset === 'true';
    return this.seedService.seed({ reset: doReset });
  }
}
