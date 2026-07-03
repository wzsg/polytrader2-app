import ts from 'typescript';
import type { StrategyCompileResult } from '@polytrader/shared';
import { STRATEGY_CONTEXT_DTS } from '@polytrader/shared';

const STRATEGY_FILE = 'strategy.ts';
const CONTEXT_FILE = 'strategy-context.d.ts';

class StrategyCompiler {
  public compile(sourceCode: string): StrategyCompileResult {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmitOnError: true,
      lib: ['lib.es2022.d.ts'],
      types: [],
    };

    const defaultHost = ts.createCompilerHost(options, true);
    const outputs = new Map<string, string>();
    const sources = new Map<string, string>([
      [STRATEGY_FILE, sourceCode],
      [CONTEXT_FILE, STRATEGY_CONTEXT_DTS],
    ]);
    const host = this.createHost(options, defaultHost, sources, outputs);
    const sourceFile = ts.createSourceFile(STRATEGY_FILE, sourceCode, options.target!, true);
    const importError = this.assertNoImports(sourceFile);
    if (importError) {
      return { status: 'failed', compiledCode: null, error: importError };
    }

    const program = ts.createProgram([CONTEXT_FILE, STRATEGY_FILE], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      return {
        status: 'failed',
        compiledCode: null,
        error: diagnostics.map((diagnostic) => this.formatDiagnostic(diagnostic)).join('\n'),
      };
    }

    const result = program.emit();
    if (result.emitSkipped) {
      return {
        status: 'failed',
        compiledCode: null,
        error:
          result.diagnostics.map((diagnostic) => this.formatDiagnostic(diagnostic)).join('\n') ||
          'Compilation failed',
      };
    }

    const compiledCode = outputs.get('strategy.js') ?? [...outputs.values()][0] ?? null;
    if (!compiledCode) {
      return {
        status: 'failed',
        compiledCode: null,
        error: 'Compilation failed: no JavaScript was emitted',
      };
    }

    return { status: 'success', compiledCode, error: null };
  }

  private createHost(
    options: ts.CompilerOptions,
    defaultHost: ts.CompilerHost,
    sources: Map<string, string>,
    outputs: Map<string, string>,
  ): ts.CompilerHost {
    return {
      ...defaultHost,
      getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        const normalized = fileName.replace(/\\/g, '/');
        const basename = normalized.split('/').pop() || fileName;
        const source = sources.get(fileName) ?? sources.get(basename);
        if (source != null) {
          return ts.createSourceFile(basename, source, languageVersion, true);
        }
        return defaultHost.getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
      },
      fileExists(fileName) {
        const normalized = fileName.replace(/\\/g, '/');
        const basename = normalized.split('/').pop() || fileName;
        return sources.has(fileName) || sources.has(basename) || defaultHost.fileExists(fileName);
      },
      readFile(fileName) {
        const normalized = fileName.replace(/\\/g, '/');
        const basename = normalized.split('/').pop() || fileName;
        return sources.get(fileName) ?? sources.get(basename) ?? defaultHost.readFile(fileName);
      },
      writeFile(fileName, text) {
        outputs.set(fileName, text);
      },
    };
  }

  private formatDiagnostic(diagnostic: ts.Diagnostic): string {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start == null) return message;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    const file =
      diagnostic.file.fileName === STRATEGY_FILE ? STRATEGY_FILE : diagnostic.file.fileName;
    return `${file}:${position.line + 1}:${position.character + 1} - ${message}`;
  }

  private assertNoImports(sourceFile: ts.SourceFile): string | null {
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
        const position = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
        return `${STRATEGY_FILE}:${position.line + 1}:${position.character + 1} - Strategy scripts do not support import. Use capabilities injected through context`;
      }
    }
    return null;
  }
}

const strategyCompiler = new StrategyCompiler();

function compileStrategySource(sourceCode: string): StrategyCompileResult {
  return strategyCompiler.compile(sourceCode);
}

export { StrategyCompiler, compileStrategySource, strategyCompiler };
