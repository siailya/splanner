/** Clones domain data across the Vue/IndexedDB boundary. Domain objects are JSON-compatible by design. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
