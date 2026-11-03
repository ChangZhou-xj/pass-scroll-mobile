ALTER TABLE `Record` ADD COLUMN `learnedAt` DATETIME(3) NULL;

UPDATE `Record`
SET `learnedAt` = COALESCE(`firstReviewedAt`, `createdAt`)
WHERE `reviewCount` > 0;

CREATE INDEX `Record_userId_learnedAt_dueAt_idx` ON `Record`(`userId`, `learnedAt`, `dueAt`);
