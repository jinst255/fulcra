// OpenAI key entry and test. Setup step 1 and Settings > OpenAI key.
// The key is saved only to chrome.storage.local, and only after its test passes.
import { useState } from 'react';
import { t } from '../../i18n/t';
import { send } from '../../messages';
import { openai } from '../../llm/openai';
import { removeApiKey, setApiKey } from '../../store/settings';
import { addLog } from '../../store/log';

export type KeyTest = null | 'testing' | 'ok' | 'bad' | 'nocredit' | 'offline';

export function KeyResult({ test }: { test: KeyTest }) {
  if (!test) return null;
  if (test === 'testing')
    return (
      <div role="status" style={{ fontSize: 14, color: 'var(--text-2)' }}>
        {t('setup.key.testing')}
      </div>
    );
  if (test === 'ok')
    return (
      <div role="status" style={{ fontSize: 14, color: 'var(--teal-dark)', fontWeight: 500 }}>
        {t('setup.key.ok')}
      </div>
    );
  if (test === 'nocredit')
    return (
      <div role="status" className="note-amber" style={{ fontSize: 14 }}>
        {t('setup.key.noCredit')}
      </div>
    );
  if (test === 'offline')
    return (
      <div role="status" className="note-amber" style={{ fontSize: 14 }}>
        {t('err.offline')}
      </div>
    );
  return (
    <div role="status" style={{ fontSize: 14, color: 'var(--red)' }}>
      {t('setup.key.bad')}
    </div>
  );
}

export async function testKey(key: string): Promise<KeyTest> {
  const r = await openai.testKey(key.trim());
  await addLog(
    r === 'ok' ? 'KEY_OK' : r === 'nocredit' ? 'NO_CREDIT' : r === 'offline' ? 'OFFLINE' : 'KEY_INVALID',
    'app',
  );
  return r;
}

export async function saveKey(key: string): Promise<void> {
  await setApiKey(key);
  await send({ type: 'keyChanged' }).catch(() => undefined);
}

export async function forgetKey(): Promise<void> {
  await removeApiKey();
  await send({ type: 'keyChanged' }).catch(() => undefined);
}

/** The key field with Show and Test key. Calls onPassed with the tested key. */
export function KeyInput({
  onPassed,
  onCancel,
}: {
  onPassed?: (key: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<KeyTest>(null);
  const run = async () => {
    setTest('testing');
    const r = await testKey(value);
    setTest(r);
    if (r === 'ok') onPassed?.(value.trim());
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label htmlFor="key-in" className="field-label" style={{ marginBottom: 0 }}>
        {t('setup.key.label')}
      </label>
      <div className="row-wrap">
        <input
          id="key-in"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          spellCheck={false}
          className="input mono"
          style={{ flex: '1 1 240px', minWidth: 0, width: 'auto' }}
          placeholder={t('setup.key.placeholder')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setTest(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && void run()}
        />
        <button type="button" className="btn" aria-pressed={show} onClick={() => setShow(!show)}>
          {show ? t('setup.key.hide') : t('setup.key.show')}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={test === 'testing' || !value.trim()}
          onClick={() => void run()}
        >
          {test === 'testing' ? t('setup.key.testing') : t('setup.key.test')}
        </button>
      </div>
      <KeyResult test={test} />
      {onCancel && (
        <div>
          <button type="button" className="link-btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
