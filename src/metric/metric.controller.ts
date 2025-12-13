import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MetricService } from './metric.service';
import { CreateMetricDto } from './dto/create-metric.dto';

@Controller('metrics')
export class MetricController {
  constructor(private readonly metricService: MetricService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createDto: CreateMetricDto) {
    return this.metricService.create(createDto);
  }

  @Get()
  findAll() {
    return this.metricService.findAll();
  }

  @Get('type/:type')
  findByType(
    @Param('type') type: string,
    @Query('limit') limit?: number,
  ) {
    return this.metricService.findByType(type, limit);
  }

  @Get('merchant/:merchantId')
  findByMerchant(@Param('merchantId') merchantId: string) {
    return this.metricService.findByMerchant(merchantId);
  }

  @Get('aggregated/:type')
  getAggregatedMetrics(
    @Param('type') type: string,
    @Query('merchantId') merchantId?: string,
    @Query('hours') hours?: number,
  ) {
    return this.metricService.getAggregatedMetrics(type, merchantId, hours);
  }

  @Get('date-range')
  findByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.metricService.findByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.metricService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.metricService.remove(id);
  }
}
