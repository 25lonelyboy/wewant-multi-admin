-- CreateEnum
CREATE TYPE "IotStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED');

-- CreateTable
CREATE TABLE "IotDeviceModel" (
    "code" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IotDeviceModel_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "IotModelVersion" (
    "id" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "IotStatus" NOT NULL,
    "properties" JSONB NOT NULL,
    "services" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IotModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IotDevice" (
    "id" TEXT NOT NULL,
    "localDeviceId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "protocolVersion" TEXT,
    "status" "IotStatus" NOT NULL DEFAULT 'PENDING',
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IotDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IotDeviceModelUsage" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fromAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toAt" TIMESTAMP(3),

    CONSTRAINT "IotDeviceModelUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IotModelVersion_modelCode_version_key" ON "IotModelVersion"("modelCode", "version");

-- CreateIndex
CREATE UNIQUE INDEX "IotDevice_localDeviceId_key" ON "IotDevice"("localDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "IotDevice_deviceId_key" ON "IotDevice"("deviceId");

-- CreateIndex
CREATE INDEX "IotDeviceModelUsage_deviceId_toAt_idx" ON "IotDeviceModelUsage"("deviceId", "toAt");

-- 每台设备至多一条 open 的 usage —— findActiveDevice 正确性的前提（schema.prisma 表达不了）
CREATE UNIQUE INDEX "IotDeviceModelUsage_deviceId_open_key"
  ON "IotDeviceModelUsage"("deviceId")
  WHERE "toAt" IS NULL;

-- AddForeignKey
ALTER TABLE "IotModelVersion" ADD CONSTRAINT "IotModelVersion_modelCode_fkey" FOREIGN KEY ("modelCode") REFERENCES "IotDeviceModel"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IotDeviceModelUsage" ADD CONSTRAINT "IotDeviceModelUsage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "IotDevice"("deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IotDeviceModelUsage" ADD CONSTRAINT "IotDeviceModelUsage_modelCode_version_fkey" FOREIGN KEY ("modelCode", "version") REFERENCES "IotModelVersion"("modelCode", "version") ON DELETE RESTRICT ON UPDATE CASCADE;
