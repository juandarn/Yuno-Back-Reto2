import { Module } from '@nestjs/common';
import { CountriesService } from './country.service';
import { CountriesController } from './country.controller';
@Module({
  controllers: [CountriesController],
  providers: [CountriesService],
  exports: [CountriesService],
})
export class CountryModule {}
