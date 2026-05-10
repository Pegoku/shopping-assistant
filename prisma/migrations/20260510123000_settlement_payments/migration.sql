-- CreateTable
CREATE TABLE "PastOrderSettlementPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromPersonId" TEXT NOT NULL,
    "toPersonId" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PastOrderSettlementPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PastOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PastOrderSettlementPayment_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PastOrderSettlementPayment_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PastOrderSettlementPayment_orderId_fromPersonId_toPersonId_key" ON "PastOrderSettlementPayment"("orderId", "fromPersonId", "toPersonId");

-- CreateIndex
CREATE INDEX "PastOrderSettlementPayment_fromPersonId_idx" ON "PastOrderSettlementPayment"("fromPersonId");

-- CreateIndex
CREATE INDEX "PastOrderSettlementPayment_toPersonId_idx" ON "PastOrderSettlementPayment"("toPersonId");
