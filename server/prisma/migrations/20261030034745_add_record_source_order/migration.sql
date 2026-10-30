-- AlterTable
ALTER TABLE `palace` MODIFY `emoji` VARCHAR(8) NOT NULL DEFAULT '🏛';

-- AlterTable
ALTER TABLE `record` ADD COLUMN `sourceOrder` INTEGER NULL;
