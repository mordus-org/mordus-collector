interface SessionManagerOptions {
  projectId: string;
  generateId(): string;
  window?: Window;
}

const documentSessions = new WeakMap<Window, Map<string, string>>();

export function isContextIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export class SessionManager {
  private sessionId: string | undefined;

  readonly #options: SessionManagerOptions;

  constructor(options: SessionManagerOptions) {
    this.#options = options;
  }

  getId(): string {
    if (this.sessionId !== undefined) {
      return this.sessionId;
    }

    const { window, projectId } = this.#options;
    const shared = window && documentSessions.get(window)?.get(projectId);

    if (shared !== undefined) {
      this.sessionId = shared;
      return shared;
    }

    const key = `mordus.session.${projectId}`;
    let stored: string | null = null;

    try {
      stored = window?.sessionStorage.getItem(key) ?? null;

      if (stored !== null && !isContextIdentifier(stored)) {
        window?.sessionStorage.removeItem(key);
        stored = null;
      }
    } catch {
      stored = null;
    }

    try {
      if (stored !== null && window?.opener) {
        const opener: Window = window.opener;

        if (opener.sessionStorage.getItem(key) === stored) {
          stored = null;
        }
      }
    } catch {
      // An inaccessible opener does not prevent local session resolution.
    }

    const sessionId = stored ?? this.#options.generateId();

    if (!isContextIdentifier(sessionId)) {
      throw new TypeError('Session ID must be an opaque identifier.');
    }

    this.sessionId = sessionId;

    if (window) {
      const sessions =
        documentSessions.get(window) ?? new Map<string, string>();
      sessions.set(projectId, sessionId);
      documentSessions.set(window, sessions);

      try {
        window.sessionStorage.setItem(key, sessionId);
      } catch {
        // The document cache preserves the session when storage is unavailable.
      }
    }

    return sessionId;
  }
}
