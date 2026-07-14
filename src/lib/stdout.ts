export interface CallbackWritable {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
}

/** Wait until the complete hook envelope has reached stdout's write callback. */
export async function writeAll(output: CallbackWritable, text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    output.write(text, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
