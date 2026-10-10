// Typed wrapper over chrome.i18n.getMessage. Blueprint section 18.
// Keys are written with dots, as in the blueprint; messages.json uses underscores.
// `{app}` placeholders are filled with the appName message automatically, so the
// product name lives in exactly one place.
import en from '../../public/_locales/en/messages.json';

type Messages = typeof en;
type Underscored = keyof Messages;
type Dotted<S extends string> = S extends `${infer A}_${infer B}` ? `${A}.${Dotted<B>}` : S;
export type MessageKey = Dotted<Underscored & string>;
export type Params = Record<string, string | number>;

interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

const table = en as unknown as Record<string, Entry>;

function chromeKey(key: string): string {
  return key.replace(/\./g, '_');
}

function orderedNames(entry: Entry): string[] {
  const ph = entry.placeholders ?? {};
  return Object.keys(ph).sort((a, b) => Number(ph[a]!.content.slice(1)) - Number(ph[b]!.content.slice(1)));
}

function fallbackFormat(entry: Entry, values: Record<string, string>): string {
  let out = entry.message.replace(
    /\$([A-Za-z0-9_]+)\$/g,
    (_m, name: string) => values[name.toLowerCase()] ?? '',
  );
  out = out.replace(/\$\$/g, '$');
  return out;
}

function getChrome(): typeof chrome | undefined {
  return typeof chrome !== 'undefined' && typeof chrome.i18n?.getMessage === 'function' ? chrome : undefined;
}

export function appName(): string {
  return getChrome()?.i18n.getMessage('appName') || table.appName!.message;
}

export function t(key: MessageKey, params: Params = {}): string {
  const ck = chromeKey(key);
  const entry = table[ck];
  if (!entry) return key;
  const names = orderedNames(entry);
  const values: Record<string, string> = {};
  for (const n of names) values[n] = n === 'app' ? appName() : String(params[n] ?? '');
  const c = getChrome();
  if (c) {
    const subs = names.map((n) => values[n]!);
    const msg = c.i18n.getMessage(ck, subs);
    if (msg) return msg;
  }
  return fallbackFormat(entry, values);
}

/** True when a message key exists. Used for keys built at runtime, like `profile.${id}`. */
export function hasKey(key: string): key is MessageKey {
  return chromeKey(key) in table;
}
