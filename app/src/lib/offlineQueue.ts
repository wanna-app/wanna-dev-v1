import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Generic FIFO offline queue stored in AsyncStorage.
 * Each entry has a stable `id` so consumers can dedupe against server state
 * after a successful flush.
 */
export interface QueueEntry<T> {
  id: string; // client-generated UUID-ish
  createdAt: number;
  payload: T;
}

const PREFIX = "wanna.offline.";

export async function loadQueue<T>(name: string): Promise<QueueEntry<T>[]> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + name);
    if (!raw) return [];
    return JSON.parse(raw) as QueueEntry<T>[];
  } catch (e) {
    console.warn("loadQueue error:", e);
    return [];
  }
}

export async function saveQueue<T>(
  name: string,
  entries: QueueEntry<T>[]
): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + name, JSON.stringify(entries));
  } catch (e) {
    console.warn("saveQueue error:", e);
  }
}

export async function enqueue<T>(
  name: string,
  payload: T
): Promise<QueueEntry<T>> {
  const queue = await loadQueue<T>(name);
  const entry: QueueEntry<T> = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    payload,
  };
  queue.push(entry);
  await saveQueue(name, queue);
  return entry;
}

export async function removeFromQueue(
  name: string,
  ids: string[]
): Promise<void> {
  const queue = await loadQueue(name);
  const remaining = queue.filter((q) => !ids.includes(q.id));
  await saveQueue(name, remaining);
}

export async function clearQueue(name: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + name);
}

/**
 * Process the queue serially. The processor is called once per entry; if it
 * resolves successfully the entry is removed. If it throws, the entry stays
 * (next flush retries). Stops on first failure to preserve FIFO order.
 */
export async function flushQueue<T>(
  name: string,
  process: (payload: T) => Promise<void>
): Promise<{ flushed: number; failed: number }> {
  const queue = await loadQueue<T>(name);
  let flushed = 0;
  let failed = 0;
  for (const entry of queue) {
    try {
      await process(entry.payload);
      await removeFromQueue(name, [entry.id]);
      flushed += 1;
    } catch (e) {
      failed += 1;
      break;
    }
  }
  return { flushed, failed };
}
