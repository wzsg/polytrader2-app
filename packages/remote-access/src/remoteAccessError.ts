class RemoteAccessError extends Error {
  private readonly _code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'RemoteAccessError';
    this._code = code;
  }

  public get code(): string {
    return this._code;
  }
}

export { RemoteAccessError };
