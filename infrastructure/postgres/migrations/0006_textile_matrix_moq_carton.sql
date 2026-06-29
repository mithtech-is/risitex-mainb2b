-- 0006: textile-domain — matrix ordering, MOQ rules, master cartons
--
-- Matrix ordering: a single product is sold as a (row dim) × (col dim) grid of variants.
-- Typically rows = size, cols = color, but the dimensions are configurable per product.

BEGIN;

-- Dimension definitions (size, color, fit, etc.)
CREATE TABLE risitex_textile.matrix_dimensions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT         NOT NULL UNIQUE,
  display_name    TEXT         NOT NULL,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO risitex_textile.matrix_dimensions (code, display_name) VALUES
  ('size',  'Size'),
  ('color', 'Color'),
  ('fit',   'Fit')
ON CONFLICT (code) DO NOTHING;

-- Dimension values (S/M/L for size; Red/Blue for color)
CREATE TABLE risitex_textile.matrix_dimension_values (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id    UUID         NOT NULL REFERENCES risitex_textile.matrix_dimensions(id) ON DELETE CASCADE,
  code            TEXT         NOT NULL,
  display_name    TEXT         NOT NULL,
  sort_order      INT          NOT NULL DEFAULT 0,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (dimension_id, code)
);

CREATE INDEX idx_matrix_dim_values_sort ON risitex_textile.matrix_dimension_values (dimension_id, sort_order);

COMMENT ON COLUMN risitex_textile.matrix_dimension_values.metadata IS 'Per-value extras. E.g. {"hex":"#FF0000"} for a color.';

-- Product matrices: ties a Medusa product to a 2D matrix
CREATE TABLE risitex_textile.product_matrices (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          TEXT         NOT NULL UNIQUE,
  row_dimension_id    UUID         NOT NULL REFERENCES risitex_textile.matrix_dimensions(id),
  col_dimension_id    UUID         NOT NULL REFERENCES risitex_textile.matrix_dimensions(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (row_dimension_id <> col_dimension_id)
);

COMMENT ON TABLE risitex_textile.product_matrices IS 'A Medusa product can have one matrix layout. row × col cells map to variants.';

-- Matrix cells: each (row_value, col_value) maps to a SKU (Medusa variant)
CREATE TABLE risitex_textile.matrix_cells (
  matrix_id       UUID    NOT NULL REFERENCES risitex_textile.product_matrices(id) ON DELETE CASCADE,
  row_value_id    UUID    NOT NULL REFERENCES risitex_textile.matrix_dimension_values(id),
  col_value_id    UUID    NOT NULL REFERENCES risitex_textile.matrix_dimension_values(id),
  variant_id      TEXT    NOT NULL,
  available       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (matrix_id, row_value_id, col_value_id)
);

CREATE INDEX idx_matrix_cells_variant ON risitex_textile.matrix_cells (variant_id);

-- Master cartons: units per carton per variant
CREATE TABLE risitex_textile.master_cartons (
  variant_id                TEXT          PRIMARY KEY,
  units_per_carton          INT           NOT NULL CHECK (units_per_carton > 0),
  carton_weight_kg          NUMERIC(8,3),
  carton_volume_m3          NUMERIC(8,4),
  must_order_full_cartons   BOOLEAN       NOT NULL DEFAULT FALSE,
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE risitex_textile.master_cartons IS 'Carton packing config per Medusa variant. If must_order_full_cartons, order qty must be a multiple of units_per_carton.';

-- MOQ rules
CREATE TABLE risitex_textile.moq_rules (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                       TEXT          NOT NULL CHECK (scope IN (
    'default', 'tier', 'company', 'product', 'product_variant', 'category'
  )),
  scope_ref_id                TEXT,

  -- At least one MOQ dimension must be set
  min_quantity                INT           CHECK (min_quantity > 0),
  min_value_inr               NUMERIC(14,2) CHECK (min_value_inr > 0),
  min_matrix_cells_filled     INT           CHECK (min_matrix_cells_filled > 0),

  active                      BOOLEAN       NOT NULL DEFAULT TRUE,
  effective_from              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  effective_to                TIMESTAMPTZ,
  priority                    INT           NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT chk_moq_at_least_one_dim CHECK (
    min_quantity            IS NOT NULL OR
    min_value_inr           IS NOT NULL OR
    min_matrix_cells_filled IS NOT NULL
  )
);

CREATE INDEX idx_moq_rules_lookup
  ON risitex_textile.moq_rules (scope, scope_ref_id, priority DESC, effective_from DESC)
  WHERE active;

COMMENT ON TABLE risitex_textile.moq_rules IS 'Minimum order quantity rules. Resolution order: product_variant > product > category > company > tier > default.';

COMMIT;
