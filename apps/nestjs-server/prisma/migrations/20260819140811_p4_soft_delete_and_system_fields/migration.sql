-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MenuType" ADD VALUE 'IFRAME';
ALTER TYPE "MenuType" ADD VALUE 'EXTERNAL';

-- DropIndex
DROP INDEX "Menu_name_key";

-- DropIndex
DROP INDEX "Menu_permission_key";

-- DropIndex
DROP INDEX "Role_code_key";

-- DropIndex
DROP INDEX "User_username_key";

-- AlterTable
ALTER TABLE "Menu" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Role" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "sex" INTEGER;

-- Partial unique indexes：唯一约束只保护活跃记录（deletedAt IS NULL），已删名字可复用
CREATE UNIQUE INDEX "User_username_alive" ON "User"("username") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Role_code_alive" ON "Role"("code") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_name_alive" ON "Menu"("name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_permission_alive" ON "Menu"("permission") WHERE "deletedAt" IS NULL;
