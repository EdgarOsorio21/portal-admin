-- Agregar columna engine a la tabla connections
ALTER TABLE connections ADD COLUMN engine VARCHAR(20) DEFAULT 'mysql' NOT NULL;

-- Actualizar todas las conexiones existentes como MySQL
UPDATE connections SET engine = 'mysql' WHERE engine IS NULL OR engine = '';
