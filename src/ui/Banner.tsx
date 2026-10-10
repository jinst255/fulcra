// In-app banners, one at a time, most urgent first. Blueprint sections 7, 12.4, 13, and 19.5.
import { useState } from 'react';
import { formatCost, formatDuration, halfPrice } from '../llm/cost';
import { t } from '../i18n/t';
import { send } from '../messages';
import { buildExport } from '../store/export';
import { deleteClosedJobs, deleteWhere } from '../store/jobs';
import { updateStatus } from '../store/settings';
import { useApp } from './AppContext';
import { inboxNameById } from './format';
import { Spinner } from './components';
import { LINKS, openExternal } from './hooks';
import { Alert, Close, Refresh } from './Icons';

interface Action {
  label: string;
  run: () => void;
  primary?: boolean;
}
interface BannerSpec {
  id: string;
  tone: 'amber' | 'red' | 'info';
  icon: 'spin' | 'refresh' | 'alert';
  title?: string;
  text: string;
  progress?: number;
  actions: Action[];
  closable?: boolean;
}

export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Banner() {
  const { status, key, jobs, settings, go, toast } = useApp();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const provider = inboxNameById(settings.email.accounts, status.emailProblemAccount);
  const toKey = () => go('settings/key');
  const waiting = jobs.filter((j) => j.scoring === 'notScored' || j.scoring === 'queued').length;

  let b: BannerSpec | null = null;
  if (status.emailRunning) {
    b = { id: 'email', tone: 'info', icon: 'spin', text: t('banner.emailRunning'), actions: [] };
  } else if (status.batch?.mode === 'half') {
    const bt = status.batch;
    b = {
      id: 'half',
      tone: 'info',
      icon: 'refresh',
      progress: bt.total ? bt.done / bt.total : 0,
      title: t('banner.half.title', { done: bt.done, total: bt.total }),
      text: bt.remoteIds.length ? t('banner.half.body') : t('banner.half.sending'),
      actions: [
        {
          label: t('banner.half.speedUp', {
            cost: formatCost(halfPrice(bt.cost * (1 - bt.done / Math.max(1, bt.total)))),
          }),
          run: () => void send({ type: 'batchSpeedUp' }),
        },
      ],
    };
  } else if (status.batch) {
    const bt = status.batch;
    b = {
      id: 'batch',
      tone: 'amber',
      icon: 'refresh',
      progress: bt.total ? bt.done / bt.total : 0,
      text:
        bt.kind === 'unscored'
          ? t('banner.scoringNew', { done: bt.done, total: bt.total })
          : bt.kind === 'all'
            ? t('banner.rescoringAll', { done: bt.done, total: bt.total })
            : bt.kind === 'new'
              ? t('banner.rescoreNew', { dimension: bt.label, done: bt.done, total: bt.total })
              : t('banner.rescoreSmall', {
                  dimension: bt.label,
                  done: bt.done,
                  total: bt.total,
                  cost: formatCost(bt.cost),
                }),
      actions: [
        {
          label: bt.paused ? t('banner.resume') : t('banner.pause'),
          run: () => void send({ type: 'batchPause', paused: !bt.paused }),
        },
      ],
    };
  } else if (status.askBatch) {
    const a = status.askBatch;
    b = {
      id: 'ask',
      tone: 'amber',
      icon: 'refresh',
      title:
        a.kind === 'unscored'
          ? t('banner.ask.titleNew', { count: a.count })
          : a.kind === 'all'
            ? t('banner.ask.titleAll', { count: a.count })
            : t('banner.ask.title', { count: a.count }),
      text: t('banner.ask.choice', {
        time: formatDuration(a.seconds),
        cost: formatCost(a.cost),
        half: formatCost(halfPrice(a.cost)),
      }),
      actions: [
        {
          label: t('banner.ask.now', { cost: formatCost(a.cost) }),
          run: () => void send({ type: 'batchStart', mode: 'now' }),
          primary: true,
        },
        {
          label: t('banner.ask.half', { cost: formatCost(halfPrice(a.cost)) }),
          run: () => void send({ type: 'batchStart', mode: 'half' }),
        },
        { label: t('banner.ask.later'), run: () => void send({ type: 'batchLater' }) },
      ],
    };
  } else if (status.storageFull) {
    b = {
      id: 'storage',
      tone: 'red',
      icon: 'alert',
      closable: true,
      text: t('err.storageFull'),
      actions: [
        {
          label: t('settings.data.deleteClosed'),
          primary: true,
          run: () =>
            void deleteClosedJobs().then(async () => {
              await updateStatus({ storageFull: false });
              toast(t('settings.data.closedDeleted'));
            }),
        },
        {
          label: t('banner.exportDeleteOld'),
          run: () =>
            void (async () => {
              downloadJson('fulcra-export.json', await buildExport());
              const cutoff = Date.now() - 90 * 86400000;
              await deleteWhere((j) => j.lastSeenAt < cutoff);
              await updateStatus({ storageFull: false });
            })(),
        },
      ],
    };
  } else if (status.scoringBlocked === 'NO_CREDIT') {
    b = {
      id: 'nocredit',
      tone: 'red',
      icon: 'alert',
      closable: true,
      text: t('err.noCredit'),
      actions: [{ label: t('err.noCreditLink'), primary: true, run: () => openExternal(LINKS.billing) }],
    };
  } else if (status.scoringBlocked === 'KEY_INVALID') {
    b = {
      id: 'keyinvalid',
      tone: 'red',
      icon: 'alert',
      closable: true,
      text: t('err.keyInvalid'),
      actions: [{ label: t('popup.noKey.button'), primary: true, run: toKey }],
    };
  } else if (status.emailProblem) {
    b = {
      id: status.emailProblem,
      tone: 'red',
      icon: 'alert',
      closable: true,
      text:
        status.emailProblem === 'MAIL_SIGNED_OUT'
          ? t('err.mailSignedOut', { provider })
          : t('err.mailChanged', { provider }),
      actions: [],
    };
  } else if (!key.hasKey && waiting > 0) {
    b = {
      id: 'waiting',
      tone: 'amber',
      icon: 'alert',
      text: t('banner.waiting', { count: waiting }),
      actions: [{ label: t('popup.noKey.button'), primary: true, run: toKey }],
    };
  } else if (!key.hasKey) {
    b = {
      id: 'nokey',
      tone: 'red',
      icon: 'alert',
      text: t('err.keyMissing'),
      actions: [{ label: t('popup.noKey.button'), primary: true, run: toKey }],
    };
  } else if (status.rateLimited) {
    b = { id: 'rate', tone: 'info', icon: 'alert', text: t('err.rateLimit'), actions: [] };
  }

  if (!b || dismissed === b.id) return null;
  return (
    <div className="wrap" style={{ paddingTop: 12 }}>
      <div role="status" className={`banner ${b.tone}`}>
        {b.icon === 'spin' ? <Spinner /> : b.icon === 'refresh' ? <Refresh /> : <Alert />}
        <div className="text">
          {b.title && <span style={{ fontWeight: 500 }}>{b.title} </span>}
          {b.text}
        </div>
        {b.progress != null && (
          <span aria-hidden="true" className="bar">
            <span style={{ width: `${Math.round(b.progress * 100)}%` }} />
          </span>
        )}
        <div className="row-wrap">
          {b.actions.map((a) => (
            <button key={a.label} type="button" className={a.primary ? 'btn primary' : 'btn'} onClick={a.run}>
              {a.label}
            </button>
          ))}
          {b.closable && (
            <button
              type="button"
              aria-label={t('common.close')}
              className="close"
              onClick={() => setDismissed(b.id)}
            >
              <Close />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
