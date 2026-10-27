-- 记忆卡片（间隔重复调度状态）+ 记忆宫殿（空间桩位）
-- 由 `npx prisma migrate diff --from-url <dev> --to-schema-datamodel prisma/schema.prisma --script` 生成

-- AlterTable
ALTER TABLE `record` ADD COLUMN `dueAt` DATETIME(3) NULL,
    ADD COLUMN `ease` DOUBLE NOT NULL DEFAULT 2.5,
    ADD COLUMN `firstReviewedAt` DATETIME(3) NULL,
    ADD COLUMN `lapses` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastReviewedAt` DATETIME(3) NULL,
    ADD COLUMN `palaceId` VARCHAR(191) NULL,
    ADD COLUMN `palaceOrder` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `reviewCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stage` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `Palace` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `emoji` VARCHAR(8) NOT NULL DEFAULT '🏛',
    `description` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,

    INDEX `Palace_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Record_userId_dueAt_idx` ON `Record`(`userId`, `dueAt`);

-- CreateIndex
CREATE INDEX `Record_palaceId_palaceOrder_idx` ON `Record`(`palaceId`, `palaceOrder`);

-- AddForeignKey
ALTER TABLE `Record` ADD CONSTRAINT `Record_palaceId_fkey` FOREIGN KEY (`palaceId`) REFERENCES `Palace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Palace` ADD CONSTRAINT `Palace_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
