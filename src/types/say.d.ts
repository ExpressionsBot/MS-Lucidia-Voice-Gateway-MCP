declare module 'say' {
  export function speak(
    text: string,
    voice?: string,
    speed?: number,
    callback?: (err: Error | string | null) => void
  ): void;

  export function stop(): void;
}