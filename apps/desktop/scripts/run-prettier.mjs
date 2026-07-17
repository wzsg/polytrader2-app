import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prettierPath = require.resolve('prettier/bin/prettier.cjs');
const prettierProcess = spawn(process.execPath, [prettierPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

const exitCode = await new Promise((resolve, reject) => {
  prettierProcess.once('error', reject);
  prettierProcess.once('exit', (code, signal) => {
    if (signal) {
      reject(new Error(`Prettier exited after receiving ${signal}`));
      return;
    }
    resolve(code ?? 1);
  });
});

process.exitCode = exitCode;
