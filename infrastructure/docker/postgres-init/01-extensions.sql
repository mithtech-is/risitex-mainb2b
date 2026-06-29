-- RISITEX PostgreSQL initialization
--
-- This file runs ONCE on first container start (when the data volume is empty).
-- It runs against the database named in POSTGRES_DB, as POSTGRES_USER.
-- Subsequent container starts skip this file (volume already initialized).
--
-- To re-run: drop the volume with `docker compose down -v`, then `pnpm docker:up`.

-- Extensions Medusa and our custom modules depend on:

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- uuid_generate_v4() etc. Medusa uses these as primary keys.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- Trigram fuzzy text matching. Used by product search and admin search.

CREATE EXTENSION IF NOT EXISTS "citext";
-- Case-insensitive text type. Used for email columns.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- gen_random_uuid(), digest(), hmac(). Used for tokens and signatures.
