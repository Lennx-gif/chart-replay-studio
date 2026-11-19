import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChartView } from '@/components/ChartView';
import type { OHLCVBar } from '@/lib/csvParser';
import type { SessionRecord } from '@/lib/db';
import { getSession, loadBars, touchSession } from '@/lib/store';

type State =
  | { status: 'loading' }
  | { status: 'missing'; message: string }
  | { status: 'ready'; session: SessionRecord; bars: OHLCVBar[] };

export default function SessionPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const session = await getSession(id);
        if (!session) throw new Error('This session was not found on this device.');
        const bars = await loadBars(session.datasetId);
        await touchSession(id);
        if (!cancelled) setState({ status: 'ready', session, bars });
      } catch (e) {
        if (!cancelled) setState({ status: 'missing', message: e instanceof Error ? e.message : 'Could not open session' });
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-background text-center p-6">
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Link to="/" className="toolbar-btn text-xs">Back to sessions</Link>
      </div>
    );
  }

  return <ChartView key={state.session.id} session={state.session} rawBars={state.bars} onExit={() => navigate('/')} />;
}
