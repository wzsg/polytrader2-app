import type { BrowserWindowConstructorOptions } from 'electron';

function getWindowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle'
> {
  if (process.platform === 'darwin') {
    return {
      frame: false,
      titleBarStyle: 'hiddenInset',
    };
  }

  return { frame: false };
}

export { getWindowChromeOptions };
