import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Transforma los tipos automáticamente
      whitelist: true, // Remueve propiedades que no están en el DTO
      forbidNonWhitelisted: false, // No lanza error por propiedades extra
      transformOptions: {
        enableImplicitConversion: true, // Convierte strings a números/booleans
      },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
