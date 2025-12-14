import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnCallController } from './on-call.controller';
import { OnCallService } from './on-call.service';
import { OnCallSchedule } from './entities/on-call-schedule.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OnCallSchedule, User])],
  controllers: [OnCallController],
  providers: [OnCallService],
  exports: [OnCallService],
})
export class OnCallModule {}
