import { DuckDBInstance } from '@duckdb/node-api';

const instance = await DuckDBInstance.create(':memory:');
const connection = await instance.connect();

try {
  await connection.run('SELECT 42 AS value');
  console.log('DuckDB native smoke test passed');
} finally {
  connection.closeSync();
  instance.closeSync();
}
