export type Timestamp = number; // Milliseconds since Unix epoch

export function createTimestamp(): Timestamp {
  return Date.now();
}
