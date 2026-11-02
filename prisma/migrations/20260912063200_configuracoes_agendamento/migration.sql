-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "min_lead_minutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "schedule_horizon_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slot_capacity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slot_window_minutes" INTEGER NOT NULL DEFAULT 30;
