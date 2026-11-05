-- 版本状态与新设备状态拆成两个枚举：设备两态（PENDING/ACTIVE）、版本三态（PENDING/ACTIVE/SUPERSEDED）。
-- 两个列都用 ::text 中转保留既有值——直接 DROP COLUMN 会丢数据。

-- CreateEnum
CREATE TYPE "IotDeviceStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "IotVersionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUPERSEDED');

-- AlterColumn（保留既有值）
ALTER TABLE "IotDevice"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "IotDeviceStatus" USING ("status"::text::"IotDeviceStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "IotModelVersion"
  ALTER COLUMN "status" TYPE "IotVersionStatus" USING ("status"::text::"IotVersionStatus");

-- DropEnum
DROP TYPE "IotStatus";

-- 同一模型至多一个 ACTIVE 版本 —— 并发发布时的库级兜底（schema.prisma 表达不了 WHERE）
CREATE UNIQUE INDEX "IotModelVersion_modelCode_active_key"
  ON "IotModelVersion"("modelCode")
  WHERE "status" = 'ACTIVE';
