-- CreateIndex
CREATE UNIQUE INDEX `RecordSnapshot_recordId_version_key` ON `RecordSnapshot`(`recordId`, `version`);

-- DropIndex
DROP INDEX `RecordSnapshot_recordId_version_idx` ON `RecordSnapshot`;
