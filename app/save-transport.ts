// Fetch limits the total body size of in-flight keepalive requests to 64 KiB.
// Normal foreground saves must not use keepalive: hand history and MTT state grow well beyond that.
export function saveKeepalive(body: string, leavingPage: boolean): boolean {
  return leavingPage && new TextEncoder().encode(body).byteLength <= 60_000;
}
