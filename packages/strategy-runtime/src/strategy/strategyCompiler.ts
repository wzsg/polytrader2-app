import { StrategyAstCompiler } from '@polytrader/strategy-ast';
import type { StrategyCompileResult } from '@polytrader/shared';

class StrategyCompiler {
  private readonly _compiler = new StrategyAstCompiler();

  public async compile(sourceCode: string): Promise<StrategyCompileResult> {
    let document: unknown;
    try {
      document = JSON.parse(sourceCode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        compiledCode: null,
        error: `Invalid strategy JSON: ${message}`,
      };
    }

    const result = await this._compiler.compile(document);
    if (result.status === 'failed') {
      return {
        status: 'failed',
        compiledCode: null,
        error: result.diagnostics
          .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
          .join('\n'),
      };
    }

    return {
      status: 'success',
      compiledCode: JSON.stringify(result.plan.document),
      error: null,
    };
  }
}

const strategyCompiler = new StrategyCompiler();

function compileStrategySource(sourceCode: string): Promise<StrategyCompileResult> {
  return strategyCompiler.compile(sourceCode);
}

export { StrategyCompiler, compileStrategySource, strategyCompiler };
