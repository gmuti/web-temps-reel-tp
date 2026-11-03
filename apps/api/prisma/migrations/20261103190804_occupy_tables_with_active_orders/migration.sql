-- Données : les tables qui avaient déjà des commandes en cours avant l'arrivée
-- de l'occupation sont occupées (sans nombre de couverts connu).
UPDATE "DiningTable" AS t
SET "status" = 'OCCUPEE',
    "statusChangedAt" = CURRENT_TIMESTAMP,
    "version" = t."version" + 1
WHERE t."status" = 'LIBRE'
  AND EXISTS (
    SELECT 1
    FROM "Order" AS o
    WHERE o."restaurantId" = t."restaurantId"
      AND o."tableNumber" = t."number"
      AND o."status" NOT IN ('SERVIE', 'ANNULEE')
  );
