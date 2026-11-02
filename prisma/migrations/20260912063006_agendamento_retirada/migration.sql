-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "scheduled_for" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "allow_delivery" SET DEFAULT false;

-- CreateIndex
CREATE INDEX "orders_scheduled_for_status_idx" ON "orders"("scheduled_for", "status");
