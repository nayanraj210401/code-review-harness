import ora, { type Ora } from "ora";

let _spinner: Ora | null = null;

export function startSpinner(text: string): void {
  _spinner = ora(text).start();
}

export function updateSpinner(text: string): void {
  if (_spinner) _spinner.text = text;
}

export function succeedSpinner(text?: string): void {
  if (_spinner) {
    _spinner.succeed(text);
    _spinner = null;
  }
}

export function failSpinner(text?: string): void {
  if (_spinner) {
    _spinner.fail(text);
    _spinner = null;
  }
}

export function stopSpinner(): void {
  if (_spinner) {
    _spinner.stop();
    _spinner = null;
  }
}
