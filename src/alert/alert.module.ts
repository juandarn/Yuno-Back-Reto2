import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { Alert } from './entities/alert.entity';
import { NotificationModule } from '../notification/notification.module';
import { NotificationChannelModule } from '../notification-channel/notification-channel.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert]),
    NotificationModule,
    NotificationChannelModule,
  ],
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
