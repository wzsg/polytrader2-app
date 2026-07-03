import { callSqliteRepository } from './workerClient.js';
import type { SqliteRepositoryName } from './sqliteWorkerProtocol.js';

type RepositoryMethod = (...args: unknown[]) => Promise<unknown>;

class SqliteRepositoryProxy {
  private readonly _repository: SqliteRepositoryName;

  public constructor(repository: SqliteRepositoryName) {
    this._repository = repository;
  }

  public method(methodName: string): RepositoryMethod {
    return (...args: unknown[]) => callSqliteRepository(this._repository, methodName, args);
  }
}

function createRepositoryProxy<T extends object>(repository: SqliteRepositoryName): T {
  const proxy = new SqliteRepositoryProxy(repository);
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') return undefined;
        return proxy.method(property);
      },
    },
  ) as T;
}

export { createRepositoryProxy };
