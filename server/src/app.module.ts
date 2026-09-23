import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RecordsModule } from "./records/records.module";

@Module({
  imports: [PrismaModule, AuthModule, RecordsModule],
  controllers: [AppController],
})
export class AppModule {}
