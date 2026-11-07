-- usage.version 改为可空：版本撤销时把引用该版本的 usage 置空。
-- 它只作出处，不参与「此刻生效哪一版」的判定（判定按 ts 走区间）。
ALTER TABLE "IotDeviceModelUsage" ALTER COLUMN "version" DROP NOT NULL;

-- 按 (modelCode, version) 找引用，供撤销时批量置空与完整性检查。
CREATE INDEX "IotDeviceModelUsage_modelCode_version_idx"
  ON "IotDeviceModelUsage"("modelCode", "version");

-- effectiveFrom 收紧为非空。存量行以创建时刻回填，一步到位避免迁移失败。
UPDATE "IotModelVersion" SET "effectiveFrom" = "createdAt" WHERE "effectiveFrom" IS NULL;
ALTER TABLE "IotModelVersion" ALTER COLUMN "effectiveFrom" SET NOT NULL;
