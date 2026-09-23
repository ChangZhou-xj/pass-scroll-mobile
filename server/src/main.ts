import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`server running at http://localhost:${port}`);
}
bootstrap();
