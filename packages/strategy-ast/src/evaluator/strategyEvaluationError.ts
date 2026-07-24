class StrategyEvaluationError extends Error {
  private readonly _code: string;
  private readonly _nodeId: string | null;

  public constructor(
    code: string,
    message: string,
    nodeId: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'StrategyEvaluationError';
    this._code = code;
    this._nodeId = nodeId;
  }

  public get code(): string {
    return this._code;
  }

  public get nodeId(): string | null {
    return this._nodeId;
  }
}

export { StrategyEvaluationError };
