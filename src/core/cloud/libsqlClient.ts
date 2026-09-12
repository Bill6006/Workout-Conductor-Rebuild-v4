import type { CloudClient, CloudStatement } from './model';

/**
 * The real client over the libsql web driver. Loaded on demand, only once a
 * token exists on the device, so a build with no token never even imports the
 * driver. The token goes to the driver and nowhere else.
 */
export async function createLibsqlCloudClient(token: string, url: string): Promise<CloudClient> {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url, authToken: token });
  const toArgs = (statement: CloudStatement) => ({ sql: statement.sql, args: statement.args });
  return {
    execute: async (statement) => {
      const result = await client.execute(toArgs(statement));
      return {
        rows: result.rows.map((row) =>
          Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
        ),
        rowsAffected: result.rowsAffected,
      };
    },
    batch: async (statements) => {
      await client.batch(statements.map(toArgs), 'write');
    },
    close: () => client.close(),
  };
}
