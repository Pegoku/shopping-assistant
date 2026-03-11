-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supermarket" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "genericNameEn" TEXT NOT NULL,
    "genericNameEs" TEXT NOT NULL,
    "quantityText" TEXT NOT NULL,
    "unitAmount" REAL,
    "normalizedUnit" TEXT,
    "currentPrice" REAL NOT NULL,
    "currentUnitPrice" REAL,
    "imageUrl" TEXT,
    "sourceUrl" TEXT,
    "dealText" TEXT,
    "isDealActive" BOOLEAN NOT NULL DEFAULT false,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    PRIMARY KEY ("productId", "categoryId"),
    CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "unitPrice" REAL,
    "isDeal" BOOLEAN NOT NULL DEFAULT false,
    "dealText" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FetchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "supermarket" TEXT,
    "sourceMode" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "itemsFetched" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "itemsExpected" INTEGER,
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "pagesExpected" INTEGER,
    "categoriesDone" INTEGER NOT NULL DEFAULT 0,
    "categoriesTotal" INTEGER,
    "currentStore" TEXT,
    "currentCategory" TEXT,
    "currentMessage" TEXT,
    "progressPercent" REAL NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "ahCategoriesDone" INTEGER NOT NULL DEFAULT 0,
    "ahCategoriesTotal" INTEGER,
    "ahPagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "ahPagesExpected" INTEGER,
    "ahItemsFound" INTEGER NOT NULL DEFAULT 0,
    "ahWarnings" INTEGER NOT NULL DEFAULT 0,
    "ahCurrentCategory" TEXT,
    "ahCurrentMessage" TEXT,
    "jumboCategoriesDone" INTEGER NOT NULL DEFAULT 0,
    "jumboCategoriesTotal" INTEGER,
    "jumboPagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "jumboPagesExpected" INTEGER,
    "jumboItemsFound" INTEGER NOT NULL DEFAULT 0,
    "jumboWarnings" INTEGER NOT NULL DEFAULT 0,
    "jumboCurrentCategory" TEXT,
    "jumboCurrentMessage" TEXT,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "AdminEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "previousValue" TEXT,
    "nextValue" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminEdit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "PriceHistory_productId_capturedAt_idx" ON "PriceHistory"("productId", "capturedAt");

-- CreateIndex
CREATE INDEX "AdminEdit_productId_createdAt_idx" ON "AdminEdit"("productId", "createdAt");
