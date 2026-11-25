CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
DO $$
BEGIN
    IF public.unaccent('Computação') <> 'Computacao' THEN
        RAISE EXCEPTION 'unaccent não atende à normalização esperada';
    END IF;
END
$$;
