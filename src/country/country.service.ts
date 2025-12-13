import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@Injectable()
export class CountriesService {
  constructor(
    @InjectRepository(Country)
    private readonly countryRepository: Repository<Country>,
  ) {}

  /**
   * Create a new country
   */
  async create(createCountryDto: CreateCountryDto): Promise<Country> {
    // Check if country with this code already exists
    const existingCountry = await this.countryRepository.findOne({
      where: { code: createCountryDto.code },
    });

    if (existingCountry) {
      throw new ConflictException(
        `Country with code ${createCountryDto.code} already exists`,
      );
    }

    const country = this.countryRepository.create(createCountryDto);
    return await this.countryRepository.save(country);
  }

  /**
   * Get all countries
   */
  async findAll(): Promise<Country[]> {
    return await this.countryRepository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Get a country by code
   */
  async findOne(code: string): Promise<Country> {
    const country = await this.countryRepository.findOne({
      where: { code: code },
    });

    if (!country) {
      throw new NotFoundException(`Country with code ${code} not found`);
    }

    return country;
  }

  /**
   * Update a country
   */
  async update(
    codigo: string,
    updateCountryDto: UpdateCountryDto,
  ): Promise<Country> {
    const country = await this.findOne(codigo);

    // Prevent changing the code (PK)
    delete updateCountryDto.code;

    Object.assign(country, updateCountryDto);

    return await this.countryRepository.save(country);
  }

  /**
   * Delete a country
   */
  async remove(code: string): Promise<void> {
    const country = await this.findOne(code);
    await this.countryRepository.remove(country);
  }

  /**
   * Check if a country exists by code
   */
  async existsByCode(code: string): Promise<boolean> {
    const count = await this.countryRepository.count({
      where: { code },
    });
    return count > 0;
  }

  /**
   * Search countries by name (partial match)
   */
  async searchByName(name: string): Promise<Country[]> {
    return await this.countryRepository
      .createQueryBuilder('pais')
      .where('LOWER(pais.nombre) LIKE LOWER(:nombre)', {
        nombre: `%${name}%`,
      })
      .orderBy('pais.nombre', 'ASC')
      .getMany();
  }
}
