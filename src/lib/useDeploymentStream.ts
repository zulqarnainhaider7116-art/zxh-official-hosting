import { useEffect, useRef, useState } from 'react';
import { api, authHeader, sleep } from './api';
import { TERMINAL_STATUSES } from './constants';
import type { LogLine } from '../components/LogViewer';

/**
 * Live deployment updates. Uses a streamed Server-Sent-Events response (fetch + ReadableStream so the
 * Authorization header can be sent). Streams reconnect automatically; falls back to polling if streaming
 * is unavailable. The server advances the background job on each stream/poll cycle.
 */
export function useDeploymentStream(id: string | null) {
  const [deployment, setDeployment] = useState<any>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [mode, setMode] = useState<'connecting' | 'stream' | 'poll' | 'done'>('connecting');
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const afterRef = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    const ctrl = new AbortController();
    afterRef.current = 0;
    setLogs([]);
    setDeployment(null);
    setError(null);
    setMode('connecting');

    const apply = (d: any) => {
      if (d.deployment) setDeployment(d.deployment);
      if (d.logs?.length) {
        const fresh = d.logs.filter((l: LogLine) => l.id > afterRef.current);
        if (fresh.length) {
          afterRef.current = fresh[fresh.length - 1].id;
          setLogs((prev) => [...prev, ...fresh].slice(-6000));
        }
      }
      return !!d.deployment && TERMINAL_STATUSES.includes(d.deployment.status);
    };

    const poll = async () => {
      setMode('poll');
      while (!stop) {
        try {
          const d = await api(`/api/deploy?action=status&id=${id}&after=${afterRef.current}`, { signal: ctrl.signal });
          setError(null);
          if (apply(d)) { setMode('done'); return; }
        } catch (e: any) {
          if (stop || e?.name === 'AbortError') return;
          setError({ status: e.status || 0, message: e.message });
          if (e.status === 404 || e.status === 403 || e.status === 401) return;
        }
        await sleep(2500);
      }
    };

    const stream = async () => {
      let failures = 0;
      while (!stop) {
        try {
          const res = await fetch(`/api/deploy?action=stream&id=${id}&after=${afterRef.current}`, { headers: await authHeader(), signal: ctrl.signal });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            if (res.status === 404 || res.status === 403 || res.status === 401) { setError({ status: res.status, message: j?.error || 'Not available' }); if (res.status === 401) window.dispatchEvent(new CustomEvent('df:session-expired')); return; }
            throw new Error('stream failed');
          }
          if (!res.body || !(res.headers.get('content-type') || '').includes('event-stream')) throw new Error('no stream');
          setMode('stream');
          setError(null);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          let ended = false;
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              const ev = /^event: (.*)$/m.exec(frame)?.[1];
              const data = /^data: (.*)$/m.exec(frame)?.[1];
              if (!data) continue;
              try {
                const parsed = JSON.parse(data);
                if (ev === 'update' && apply(parsed)) ended = true;
                if (ev === 'end') ended = true;
              } catch { /* ignore malformed frame */ }
            }
          }
          if (ended) { setMode('done'); return; }
          failures = 0;
        } catch (e: any) {
          if (stop || e?.name === 'AbortError') return;
          failures++;
          if (failures >= 2) return poll();
          await sleep(1200);
        }
      }
    };

    stream();
    return () => { stop = true; ctrl.abort(); };
  }, [id, nonce]);

  return { deployment, logs, mode, error, reconnect: () => setNonce((n) => n + 1) };
}
