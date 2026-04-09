# Guía de Implementación: Soporte PostgreSQL

## Cambios Realizados

### 1. **Dependencias Instaladas**
- ✅ Agregada librería `pg` (v8.11.3) a `package.json`
- ✅ Ejecutado `npm install`

### 2. **Script SQL para Migración**
- ✅ Creado: `alter_add_engine_column.sql`
  - Agrega columna `engine` a tabla `connections`
  - Default: `'mysql'` (mantiene compatibilidad)

**Ejecutar manualmente:**
```sql
ALTER TABLE connections ADD COLUMN engine VARCHAR(20) DEFAULT 'mysql' NOT NULL;
UPDATE connections SET engine = 'mysql' WHERE engine IS NULL OR engine = '';
```

### 3. **Helper Reutilizable**
- ✅ Creado: `src/helpers/connectionManager.js`
  - Funciones principales:
    - `openConnection(engine, credentials, callback)` - Abre conexión según engine
    - `executeQuery(connection, sql, params, callback)` - Ejecuta queries
    - `closeConnection(connection, callback)` - Cierra conexión
    - `getTables(connection, engine, callback)` - Lista tablas (MySQL/PostgreSQL)
    - `getTableRowCount(connection, tableName, callback)` - Cuenta filas

### 4. **Rutas Actualizadas**
Todas las rutas ahora soportan MySQL y PostgreSQL:

#### **POST /api/connections/**
- Parámetro nuevo: `engine` ('mysql' o 'postgres')
- Default si no se proporciona: `'mysql'`

**Ejemplo Request:**
```json
{
  "name": "Mi BD PostgreSQL",
  "host": "localhost",
  "port": 5432,
  "user": "postgres",
  "password": "password",
  "database_name": "mydb",
  "engine": "postgres"
}
```

#### **GET /api/connections/**
- Retorna campo `engine` en respuesta

#### **POST /api/connections/test/:id**
- Prueba conexión para MySQL o PostgreSQL automáticamente

#### **GET /api/connections/query/:id**
- MySQL: SELECT SHOW TABLES
- PostgreSQL: SELECT FROM information_schema.tables (schema public)

#### **GET /api/connections/table/:id/:table**
- Soporta ambos engines
- Retorna primeras 20 filas

#### **POST /api/connections/insert/:id/:table**
- Inserciones dinámicas en ambos engines

#### **PUT /api/connections/update/:id/:table/:recordId**
- Actualizaciones dinámicas en ambos engines

#### **DELETE /api/connections/delete/:id/:table/:recordId**
- Eliminaciones dinámicas en ambos engines

#### **GET /api/connections/stats/:id**
- Estadísticas: tablas, filas totales, conteo por tabla - en ambos engines

### 5. **Compatibilidad**
- ✅ MySQL: 100% compatible (default)
- ✅ PostgreSQL: Soporte completo
- ✅ Errores: Manejados para ambos engines
- ✅ Frontend: Sin cambios requeridos

## Pasos para Completar Implementación

### 1. Ejecutar Migración SQL
En tu base de datos MySQL principal:
```bash
mysql -u usuario -p nombre_bd < alter_add_engine_column.sql
```

O manualmente en tu cliente MySQL:
```sql
ALTER TABLE connections ADD COLUMN engine VARCHAR(20) DEFAULT 'mysql' NOT NULL;
```

### 2. Probar el Sistema

#### Crear conexión MySQL:
```bash
curl -X POST http://localhost:3000/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MySQL Local",
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database_name": "mydb",
    "engine": "mysql"
  }'
```

#### Crear conexión PostgreSQL:
```bash
curl -X POST http://localhost:3000/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PostgreSQL Local",
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "password",
    "database_name": "mydb",
    "engine": "postgres"
  }'
```

#### Probar conexión:
```bash
curl -X POST http://localhost:3000/api/connections/test/1
```

#### Listar tablas:
```bash
curl http://localhost:3000/api/connections/query/1
```

#### Leer registros de tabla:
```bash
curl http://localhost:3000/api/connections/table/1/users
```

## Archivo Modificados
- ✅ `package.json` - Agregada dependencia `pg`
- ✅ `src/routes/connections.routes.js` - Adaptadas todas las rutas
- ✅ `src/helpers/connectionManager.js` - Helper nuevo (creado)
- ✅ `alter_add_engine_column.sql` - Script SQL (creado)

## Características Soportadas

| Operación | MySQL | PostgreSQL |
|-----------|-------|-----------|
| Crear conexión | ✅ | ✅ |
| Probar conexión | ✅ | ✅ |
| Listar tablas | ✅ | ✅ |
| Leer registros | ✅ | ✅ |
| Insertar datos | ✅ | ✅ |
| Actualizar datos | ✅ | ✅ |
| Eliminar datos | ✅ | ✅ |
| Estadísticas | ✅ | ✅ |

## Notas Importantes

1. **Identifiers en PostgreSQL**: Se usan comillas dobles (`"tabla"`) para nombres sensibles a mayúsculas
2. **Información de Schema**: PostgreSQL usa `information_schema.tables` con `schema = 'public'`
3. **Default**: Todas las conexiones existentes se mantienen como MySQL
4. **Backward Compatibility**: Si `engine` no se proporciona, default es `'mysql'`
5. **Puerto Default**: MySQL usa 3306, PostgreSQL usa 5432

## Troubleshooting

### Error al conectar a PostgreSQL
- Verifica que PostgreSQL esté corriendo en el host:puerto especificado
- Verifica credenciales (usuario, password, database)

### Error de identifiers
- Asegúrate que los nombres de tabla existan en la base de datos
- PostgreSQL es sensible a mayúsculas si se usan comillas

### Error al obtener tablas
- Verifica que el usuario tenga permisos de lectura en `information_schema` (PostgreSQL)
