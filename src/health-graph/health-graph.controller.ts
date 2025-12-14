import { Controller, Get, Query } from '@nestjs/common';
import { HealthGraphService } from './health-graph.service';
import {
  HealthGraphResponse,
  QueryHealthGraphDto,
} from './dto/health-graph.dto';

@Controller('health-graph')
export class HealthGraphController {
  constructor(private readonly healthGraphService: HealthGraphService) {}

  @Get()
  async getHealthGraph(
    @Query() query: QueryHealthGraphDto,
  ): Promise<HealthGraphResponse> {
    return this.healthGraphService.getHealthGraph(query);
  }

  @Get('critical')
  async getCriticalRoutes(
    @Query() query: QueryHealthGraphDto,
  ): Promise<HealthGraphResponse> {
    return this.healthGraphService.getHealthGraph({
      ...query,
      only_issues: true,
    });
  }
}
