// GitHub Pages edition: the same game state API backed by this browser.
// There is no remote service, shared bankroll, or ChatGPT identity in this edition.
type StoredSave = { state: unknown; updatedAt: number };

export function storageKey() {
  return `poker-career-save:${new URL("./", document.baseURI).pathname}`;
}

export async function pokerStateFetch(_url: string, init: RequestInit = {}): Promise<Response> {
  const run = () => {
    const key = storageKey();
    let saved: StoredSave | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw) as StoredSave;
        if (!value || !Number.isSafeInteger(value.updatedAt) || !value.state) throw new Error("Invalid save");
        saved = value;
      }
    } catch {
      return Response.json({ error: "Browser save is unavailable or damaged" }, { status: 503 });
    }
    if (!init.method || init.method.toUpperCase() === "GET") {
      return Response.json({ state: saved?.state ?? null, updatedAt: saved?.updatedAt ?? null, cacheOwner: `local:${key}` });
    }
    if (init.method.toUpperCase() !== "PUT") return Response.json({ error: "Unsupported method" }, { status: 405 });
    const revision = Number(new Headers(init.headers).get("x-save-revision"));
    if (!Number.isSafeInteger(revision) || revision !== (saved?.updatedAt ?? 0)) {
      return Response.json({ error: "Save changed in another tab" }, { status: 409 });
    }
    let state: { version?: number; career?: unknown };
    try {
      state = JSON.parse(String(init.body));
      if (state.version !== 2 || !state.career) throw new Error("Invalid save");
    } catch {
      return Response.json({ error: "Invalid save" }, { status: 400 });
    }
    const updatedAt = Math.max(Date.now(), revision + 1);
    try {
      window.localStorage.setItem(key, JSON.stringify({ state, updatedAt }));
    } catch {
      return Response.json({ error: "Browser storage is full or blocked" }, { status: 413 });
    }
    return Response.json({ saved: true, updatedAt });
  };
  if (navigator.locks) return navigator.locks.request(storageKey(), run);
  return run();
}

/** Read both raw records without modifying them, including damaged JSON. */
export function readSaveBackup(): { primary: string | null; backup: string | null } {
  const key = storageKey();
  return { primary: window.localStorage.getItem(key), backup: window.localStorage.getItem(`poker-local-save:local:${key}`) };
}
