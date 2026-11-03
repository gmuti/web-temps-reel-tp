/*
  Warnings:

  - You are about to drop the column `createdById` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `product` on the `OrderItem` table. All the data in the column will be lost.
  - Added the required column `waiterId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `meal` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `price` to the `OrderItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_createdById_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "createdById",
ADD COLUMN     "waiterId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "product",
ADD COLUMN     "meal" TEXT NOT NULL,
ADD COLUMN     "price" DECIMAL(10,2) NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
