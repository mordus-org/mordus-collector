import type { NavigationType, PageContext } from '../types/events.js';

export function sanitizePath(value: string): string {
  try {
    const url = new URL(value, 'https://argus.invalid');
    const pathname = sanitizeSegments(url.pathname);
    const hash = url.hash.startsWith('#/')
      ? `#${sanitizeSegments(url.hash.slice(1).split('?')[0] ?? '/')}`
      : '';

    return `${pathname}${hash}`.slice(0, 1024);
  } catch {
    return '/';
  }
}

function sanitizeSegments(path: string): string {
  return path
    .split('/')
    .map((segment) => {
      let decoded: string;

      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return '[redacted]';
      }

      if (
        decoded === '[redacted]' ||
        decoded.length > 64 ||
        /[@=\s]/.test(decoded) ||
        /(?:token|password|secret)/i.test(decoded) ||
        !/^[a-zA-Z0-9._:~-]*$/.test(decoded)
      ) {
        return '[redacted]';
      }

      return decoded;
    })
    .join('/');
}

export function copyPage(page: PageContext): PageContext {
  const result: PageContext = { path: sanitizePath(page.path) };

  if (typeof page.previousPath === 'string') {
    result.previousPath = sanitizePath(page.previousPath);
  }

  if (typeof page.route === 'string') {
    result.route = sanitizePath(page.route);
  }

  if (
    page.navigationType !== undefined &&
    [
      'initial',
      'pushState',
      'replaceState',
      'popstate',
      'hashchange',
      'router',
    ].includes(page.navigationType ?? '')
  ) {
    result.navigationType = page.navigationType;
  }

  return result;
}

export class PageManager {
  private page: PageContext = { path: '/' };
  private initialized = false;

  get current(): PageContext {
    return { ...this.page };
  }

  reset(): void {
    this.initialized = false;
  }

  update(
    path: string,
    navigationType: NavigationType,
    route?: string,
  ): PageContext | null {
    const nextPath = sanitizePath(path);
    const nextRoute = route === undefined ? undefined : sanitizePath(route);

    if (this.initialized && nextPath === this.page.path) {
      if (nextRoute !== undefined) {
        this.page = { ...this.page, route: nextRoute };
      }

      return null;
    }

    this.page = {
      path: nextPath,
      navigationType,
      ...(this.initialized ? { previousPath: this.page.path } : {}),
      ...(nextRoute === undefined ? {} : { route: nextRoute }),
    };
    this.initialized = true;

    return this.current;
  }
}
