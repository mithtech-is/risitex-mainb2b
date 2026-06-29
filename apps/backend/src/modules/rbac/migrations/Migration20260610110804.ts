import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260610110804 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "rbac_user_role" drop constraint if exists "rbac_user_role_actor_type_actor_id_role_id_company_id_unique";`);
    this.addSql(`alter table if exists "rbac_role_permission" drop constraint if exists "rbac_role_permission_role_id_permission_allow_unique";`);
    this.addSql(`alter table if exists "rbac_role" drop constraint if exists "rbac_role_code_unique";`);
    this.addSql(`create table if not exists "rbac_role" ("id" text not null, "code" text not null, "display_name" text not null, "description" text null, "scope" text check ("scope" in ('admin', 'b2b_company', 'sales_rep')) not null, "active" boolean not null default true, "is_system" boolean not null default false, "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rbac_role_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_role_deleted_at" ON "rbac_role" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rbac_role_code_unique" ON "rbac_role" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_role_scope_active" ON "rbac_role" ("scope", "active") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "rbac_role_permission" ("id" text not null, "permission" text not null, "allow" boolean not null default true, "metadata" jsonb null, "role_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rbac_role_permission_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_role_permission_role_id" ON "rbac_role_permission" ("role_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_role_permission_deleted_at" ON "rbac_role_permission" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rbac_role_permission_role_id_permission_allow_unique" ON "rbac_role_permission" ("role_id", "permission", "allow") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "rbac_user_role" ("id" text not null, "actor_type" text check ("actor_type" in ('user', 'customer')) not null, "actor_id" text not null, "company_id" text null, "granted_by_user_id" text null, "granted_at" timestamptz not null, "expires_at" timestamptz null, "metadata" jsonb null, "role_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "rbac_user_role_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_user_role_role_id" ON "rbac_user_role" ("role_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_user_role_deleted_at" ON "rbac_user_role" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_rbac_user_role_actor_type_actor_id_role_id_company_id_unique" ON "rbac_user_role" ("actor_type", "actor_id", "role_id", "company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_user_role_actor_type_actor_id" ON "rbac_user_role" ("actor_type", "actor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_rbac_user_role_company_id" ON "rbac_user_role" ("company_id") WHERE company_id IS NOT NULL AND deleted_at IS NULL;`);

    this.addSql(`alter table if exists "rbac_role_permission" add constraint "rbac_role_permission_role_id_foreign" foreign key ("role_id") references "rbac_role" ("id") on update cascade;`);

    this.addSql(`alter table if exists "rbac_user_role" add constraint "rbac_user_role_role_id_foreign" foreign key ("role_id") references "rbac_role" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "rbac_role_permission" drop constraint if exists "rbac_role_permission_role_id_foreign";`);

    this.addSql(`alter table if exists "rbac_user_role" drop constraint if exists "rbac_user_role_role_id_foreign";`);

    this.addSql(`drop table if exists "rbac_role" cascade;`);

    this.addSql(`drop table if exists "rbac_role_permission" cascade;`);

    this.addSql(`drop table if exists "rbac_user_role" cascade;`);
  }

}
