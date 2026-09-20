import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "../lib/request-context";

const requestContextStorage = new AsyncLocalStorage<RequestContext | null>();

export function runWithRequestContext<T>(context: RequestContext | null, callback: () => Promise<T>): Promise<T> {
  return requestContextStorage.run(context, callback);
}

export function getRequestContext(): RequestContext | null {
  return requestContextStorage.getStore() ?? null;
}
