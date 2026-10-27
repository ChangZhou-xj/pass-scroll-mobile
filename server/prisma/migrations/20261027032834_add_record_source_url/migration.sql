-- AlterTable
ALTER TABLE `Record` ADD COLUMN `sourceUrl` VARCHAR(512) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Record_userId_sourceUrl_key` ON `Record`(`userId`, `sourceUrl`);
