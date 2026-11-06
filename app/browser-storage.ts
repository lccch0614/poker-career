// GitHub Pages edition: the same game state API backed by this browser.
// There is no remote service, shared bankroll, or ChatGPT identity in this edition.
type StoredSave = { state?: unknown; updatedAt: number; encoding?: "gzip-base64"; compressed?: string; reset?: boolean };

async function compressState(body: string): Promise<string> {
  const stream = new Blob([body]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function decompressState(encoded: string): Promise<unknown> {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

export function storageKey() {
  return `poker-career-save:${new URL("./", document.baseURI).pathname}`;
}

export async function pokerStateFetch(_url: string, init: RequestInit = {}): Promise<Response> {
  const run = async () => {
    const key = storageKey();
    let saved: StoredSave | null = null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw) as StoredSave;
        if (!value || !Number.isSafeInteger(value.updatedAt)) throw new Error("Invalid save");
        if (value.encoding === "gzip-base64" && typeof value.compressed === "string") value.state = await decompressState(value.compressed);
        if (!value.state && value.reset !== true) throw new Error("Invalid save");
        saved = value;
      }
    } catch {
      return Response.json({ error: "Browser save is unavailable or damaged" }, { status: 503 });
    }
    if (!init.method || init.method.toUpperCase() === "GET") {
      return Response.json({ state: saved?.state ?? null, updatedAt: saved?.updatedAt ?? null, cacheOwner: `local:${key}`, reset: saved?.reset === true });
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
    const currentRevision = () => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      const current = JSON.parse(raw) as StoredSave;
      if (!Number.isSafeInteger(current.updatedAt)) throw new Error("Invalid save");
      return current.updatedAt;
    };
    try {
      if (currentRevision() !== revision) return Response.json({ error: "Save changed in another tab" }, { status: 409 });
    } catch { return Response.json({ error: "Browser save is unavailable or damaged" }, { status: 503 }); }
    const updatedAt = Math.max(Date.now(), revision + 1);
    try {
      window.localStorage.setItem(key, JSON.stringify({ state, updatedAt }));
    } catch {
      // A quota failure must never delete the previous save or a newer backup.
      // Compress only the new record, then atomically replace the primary key.
      try {
        if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") throw new Error("Compression unavailable");
        const compressed = await compressState(JSON.stringify(state));
        if (currentRevision() !== revision) return Response.json({ error: "Save changed in another tab" }, { status: 409 });
        window.localStorage.setItem(key, JSON.stringify({ encoding: "gzip-base64", compressed, updatedAt }));
      } catch {
        return Response.json({ error: "Browser storage is full or blocked" }, { status: 413 });
      }
    }
    return Response.json({ saved: true, updatedAt });
  };
  if (navigator.locks) return navigator.locks.request(storageKey(), run);
  return run();
}

/** Preserve a recovery copy unless the user explicitly chooses to reset without one. */
export async function resetSaveState(expected: { primary: string | null; backup: string | null }, withoutRecovery = false): Promise<void> {
  const run = () => {
    const key = storageKey();
    const current = readSaveBackup();
    if (current.primary !== expected.primary || current.backup !== expected.backup) throw new Error("存檔已被其他分頁更新，請重新載入後再試。");
    const previousRevision = (() => { try { return JSON.parse(current.primary ?? "null")?.updatedAt ?? 0; } catch { return 0; } })();
    const revision = Math.max(Date.now(), Number.isSafeInteger(previousRevision) ? previousRevision + 1 : 1);
    if (!withoutRecovery) {
      try {
        window.localStorage.setItem(`poker-before-import:${key}`, JSON.stringify({ ...current, preservedAt: new Date().toISOString() }));
      } catch (error) {
        if (error instanceof Error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
          const quotaError = new Error("儲存空間不足，無法保留重設前備份。");
          quotaError.name = "ResetBackupQuotaExceeded";
          throw quotaError;
        }
        throw error;
      }
    }
    window.localStorage.setItem(key, JSON.stringify({ state: null, reset: true, updatedAt: revision }));
  };
  if (navigator.locks) await navigator.locks.request(storageKey(), run);
  else run();
}

/** Read both raw records without modifying them, including damaged JSON. */
export function readSaveBackup(): { primary: string | null; backup: string | null } {
  const key = storageKey();
  return { primary: window.localStorage.getItem(key), backup: window.localStorage.getItem(`poker-local-save:local:${key}`) };
}

/** Decode the portable raw backup without touching browser storage. */
export async function decodeSaveBackup(text: string, isValid: (state: unknown) => boolean = () => true): Promise<unknown> {
  if (text.length > 20_000_000) throw new Error("備份檔案過大");
  const backup = JSON.parse(text) as { primary?: string | null; backup?: string | null };
  const candidates = [backup.backup, backup.primary];
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    try {
      const value = JSON.parse(raw);
      const state = value?.encoding === "gzip-base64" && typeof value.compressed === "string"
        ? await decompressState(value.compressed) : value?.state ?? (value?.version ? value : null);
      if (state && isValid(state)) return state;
    } catch { /* Try the other copy. */ }
  }
  throw new Error("備份內沒有可讀取的存檔");
}

/** Preserve both old records before replacing a save; refuse if preservation fails. */
export async function importSaveState(state: unknown, expected?: { primary: string | null; backup: string | null }): Promise<void> {
  const run = () => {
    const key = storageKey();
    const backupKey = `poker-local-save:local:${key}`;
    const current = readSaveBackup();
    if (expected && (expected.primary !== current.primary || expected.backup !== current.backup)) {
      throw new Error("本機存檔已被另一個分頁更新；請重新載入後再試。");
    }
    const previous = { ...current, preservedAt: new Date().toISOString() };
    const previousRevision = (() => { try { return JSON.parse(previous.primary ?? "null")?.updatedAt ?? 0; } catch { return 0; } })();
    const revision = Math.max(Date.now(), Number.isSafeInteger(previousRevision) ? previousRevision + 1 : 1);
    // Keep the old copies accessible even if the following write fails.
    window.localStorage.setItem(`poker-before-import:${key}`, JSON.stringify(previous));
    // Replace the primary first: if this fails, neither original record changes.
    window.localStorage.setItem(key, JSON.stringify({ state, updatedAt: revision }));
    // A full device may reject the secondary copy after the primary succeeds.
    // Keep the previous secondary (and pre-import archive) in that case.
    try { window.localStorage.setItem(backupKey, JSON.stringify(state)); } catch { /* primary is already durable */ }
  };
  if (navigator.locks) await navigator.locks.request(storageKey(), run);
  else run();
}
