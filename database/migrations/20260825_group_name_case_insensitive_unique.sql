DO $$
BEGIN
    IF EXISTS (
        SELECT LOWER(BTRIM(grupadi))
        FROM gruplar
        GROUP BY LOWER(BTRIM(grupadi))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Gruplarda büyük/küçük harf veya boşluk farkıyla yinelenen adlar var; migration öncesinde birleştirilmelidir';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gruplar_adi_normalize
    ON gruplar (LOWER(BTRIM(grupadi)));
