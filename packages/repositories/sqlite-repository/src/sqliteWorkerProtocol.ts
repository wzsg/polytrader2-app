type SqliteRepositoryName =
  | 'accountData'
  | 'developerDiagnostics'
  | 'event'
  | 'meta'
  | 'mcpServerAccessLog'
  | 'preference'
  | 'polymarketWallet'
  | 'polymarketWithdrawal'
  | 'strategyBot'
  | 'strategyCatalog'
  | 'strategyRun'
  | 'watchlist'
  | 'workflowTask';

interface SqliteWorkerInitOptions {
  userDataPath: string;
  migrationsFolder: string;
}

interface SqliteWorkerErrorPayload {
  name: string;
  message: string;
  stack?: string;
}

type SqliteWorkerRequest =
  | {
      id: string;
      type: 'init';
      options: SqliteWorkerInitOptions;
    }
  | {
      id: string;
      type: 'call';
      repository: SqliteRepositoryName;
      method: string;
      args: unknown[];
    }
  | {
      id: string;
      type: 'close';
    };

type SqliteWorkerResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      ok: false;
      error: SqliteWorkerErrorPayload;
    };

export type {
  SqliteRepositoryName,
  SqliteWorkerErrorPayload,
  SqliteWorkerInitOptions,
  SqliteWorkerRequest,
  SqliteWorkerResponse,
};
