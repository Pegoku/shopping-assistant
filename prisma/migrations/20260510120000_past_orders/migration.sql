-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PastOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supermarket" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "orderedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payerId" TEXT,
    "total" REAL NOT NULL DEFAULT 0,
    "rawReceiptText" TEXT,
    "receiptImageName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PastOrder_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PastOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "receiptName" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" REAL,
    "totalPrice" REAL NOT NULL,
    "aiConfidence" REAL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PastOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PastOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PastOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PastOrderItemShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "percent" REAL NOT NULL,
    CONSTRAINT "PastOrderItemShare_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PastOrderItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PastOrderItemShare_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceiptProductAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supermarket" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReceiptProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_name_key" ON "Person"("name");

-- CreateIndex
CREATE INDEX "PastOrder_orderedAt_idx" ON "PastOrder"("orderedAt");

-- CreateIndex
CREATE INDEX "PastOrder_supermarket_idx" ON "PastOrder"("supermarket");

-- CreateIndex
CREATE INDEX "PastOrderItem_orderId_sortOrder_idx" ON "PastOrderItem"("orderId", "sortOrder");

-- CreateIndex
CREATE INDEX "PastOrderItem_productId_idx" ON "PastOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PastOrderItemShare_itemId_personId_key" ON "PastOrderItemShare"("itemId", "personId");

-- CreateIndex
CREATE INDEX "PastOrderItemShare_personId_idx" ON "PastOrderItemShare"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptProductAlias_supermarket_normalized_key" ON "ReceiptProductAlias"("supermarket", "normalized");

-- CreateIndex
CREATE INDEX "ReceiptProductAlias_productId_idx" ON "ReceiptProductAlias"("productId");
