export interface DbQueryResult<Row extends object> {
  rowCount: number | null;
  rows: Row[];
}

export interface DbClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<DbQueryResult<Row>>;
}

export interface DbPool extends DbClient {
  end?: () => Promise<void>;
}
