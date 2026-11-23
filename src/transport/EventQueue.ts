export class EventQueue {
  private readonly entries: string[] = [];

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.entries.length;
  }

  push(event: string): boolean {
    if (this.size >= this.capacity) return false;

    this.entries.push(event);
    return true;
  }

  batch(limit: number, maxBytes: number): string[] {
    const selected: string[] = [];
    let bytes = new TextEncoder().encode('{"events":[]}').length;

    for (const entry of this.entries.slice(0, limit)) {
      const nextBytes =
        new TextEncoder().encode(entry).length + (selected.length > 0 ? 1 : 0);
      if (bytes + nextBytes > maxBytes) break;

      bytes += nextBytes;
      selected.push(entry);
    }

    return selected;
  }

  remove(count: number): void {
    this.entries.splice(0, count);
  }

  clear(): number {
    return this.entries.splice(0).length;
  }
}
