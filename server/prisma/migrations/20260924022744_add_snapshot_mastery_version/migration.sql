-- AlterTable
ALTER TABLE `record` ADD COLUMN `mastery` ENUM('NONE', 'LEARNING', 'MASTERED') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `RecordSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `recordId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecordSnapshot_recordId_version_idx`(`recordId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RecordSnapshot` ADD CONSTRAINT `RecordSnapshot_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `Record`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
