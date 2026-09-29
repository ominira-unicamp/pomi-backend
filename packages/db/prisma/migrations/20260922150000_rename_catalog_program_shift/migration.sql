-- Rename enum values without rewriting CatalogProgram rows.
ALTER TYPE "data"."CatalogProgramShift"
    RENAME VALUE 'INTEGRAL' TO 'DAYTIME';
ALTER TYPE "data"."CatalogProgramShift"
    RENAME VALUE 'NOTURNO' TO 'NIGHT';
