import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnCallSchedule } from './entities/on-call-schedule.entity';
import {
  CreateOnCallScheduleDto,
  UpdateOnCallScheduleDto,
} from './dto/on-call-schedule.dto';
import { User } from '../user/entities/user.entity';

@Injectable()
export class OnCallService {
  private readonly logger = new Logger(OnCallService.name);

  constructor(
    @InjectRepository(OnCallSchedule)
    private scheduleRepository: Repository<OnCallSchedule>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }
    return d;
  }

  private async assertUserExists(userId: string): Promise<void> {
    const exists = await this.userRepository.findOne({ where: { id: userId } });
    if (!exists) {
      throw new BadRequestException(`El usuario con ID ${userId} no existe`);
    }
  }

  async create(createDto: CreateOnCallScheduleDto): Promise<OnCallSchedule> {
    await this.assertUserExists(createDto.user_id);

    const schedule = this.scheduleRepository.create({
      user_id: createDto.user_id,
      priority: createDto.priority,
      active: createDto.active ?? true,
      start_at: this.parseDate(createDto.start_at) ?? undefined,
      end_at: this.parseDate(createDto.end_at) ?? undefined,
    });

    return await this.scheduleRepository.save(schedule);
  }

  async findAll(active?: boolean): Promise<OnCallSchedule[]> {
    const where: any = {};
    if (typeof active === 'boolean') where.active = active;

    return await this.scheduleRepository.find({
      where,
      relations: ['user'],
      order: { priority: 'ASC', created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OnCallSchedule> {
    const schedule = await this.scheduleRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!schedule) {
      throw new NotFoundException(`OnCallSchedule con ID ${id} no encontrado`);
    }

    return schedule;
  }

  async findByUser(userId: string): Promise<OnCallSchedule[]> {
    return await this.scheduleRepository.find({
      where: { user_id: userId },
      relations: ['user'],
      order: { priority: 'ASC', created_at: 'DESC' },
    });
  }

  async findByPriority(priority: number): Promise<OnCallSchedule | null> {
    const now = new Date();

    return await this.scheduleRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .where('s.active = true')
      .andWhere('s.priority = :priority', { priority })
      .andWhere('(s.start_at IS NULL OR s.start_at <= :now)', { now })
      .andWhere('(s.end_at IS NULL OR s.end_at >= :now)', { now })
      .orderBy('s.start_at', 'DESC', 'NULLS LAST')
      .addOrderBy('s.created_at', 'DESC')
      .getOne();
  }

  async current(): Promise<OnCallSchedule | null> {
    const now = new Date();

    return await this.scheduleRepository
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.user', 'user')
      .where('s.active = true')
      .andWhere('(s.start_at IS NULL OR s.start_at <= :now)', { now })
      .andWhere('(s.end_at IS NULL OR s.end_at >= :now)', { now })
      .orderBy('s.priority', 'ASC')
      .addOrderBy('s.start_at', 'DESC', 'NULLS LAST')
      .addOrderBy('s.created_at', 'DESC')
      .getOne();
  }

  async update(
    id: string,
    updateDto: UpdateOnCallScheduleDto,
  ): Promise<OnCallSchedule> {
    const schedule = await this.findOne(id);

    if (updateDto.user_id) {
      await this.assertUserExists(updateDto.user_id);
      schedule.user_id = updateDto.user_id;
    }

    if (typeof updateDto.priority === 'number')
      schedule.priority = updateDto.priority;
    if (typeof updateDto.active === 'boolean')
      schedule.active = updateDto.active;

    if (typeof updateDto.start_at !== 'undefined') {
      schedule.start_at = this.parseDate(updateDto.start_at) ?? undefined;
    }
    if (typeof updateDto.end_at !== 'undefined') {
      schedule.end_at = this.parseDate(updateDto.end_at) ?? undefined;
    }

    return await this.scheduleRepository.save(schedule);
  }

  async toggleActive(id: string): Promise<OnCallSchedule> {
    const schedule = await this.findOne(id);
    schedule.active = !schedule.active;
    return await this.scheduleRepository.save(schedule);
  }

  async remove(id: string): Promise<void> {
    const schedule = await this.findOne(id);
    await this.scheduleRepository.remove(schedule);
  }
}
