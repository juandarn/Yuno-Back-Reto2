import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodModule } from './payment-method/payment-method.module';
import { ProvidersModule } from './provider/providers.module';
import { CountryModule } from './country/country.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'usuario',
      password: 'usuario',
      database: 'yuno',
      entities: [],
      synchronize: true,
    }),
    PaymentMethodModule,
    ProvidersModule,
    CountryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
