/** Native operating-system file selection, bridged through Electron main. */
export function pickFiles(title: string, options: { save?: boolean; multiple?: boolean; filename?: string } = {}): Promise<string[] | null> {
  return window.hopdock.files.pick(title, options);
}
