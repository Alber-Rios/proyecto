import React from 'react';
import { RefreshCw } from 'lucide-react';
import { isChunkLoadError, reloadOnceForNewVersion } from '../lib/lazyWithRetry.ts';

interface State {
  error: Error | null;
}

// Si algo falla al dibujar una página, se muestra un aviso con "Recargar" en vez
// de una pantalla en blanco. Si el error es por una versión vieja, recarga sola.
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error)) reloadOnceForNewVersion();
    console.error('Error en la página:', error);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg font-bold text-slate-950">No pudimos cargar esta página</p>
        <p className="text-sm text-slate-600">
          Puede ser la conexión o que publicamos una versión nueva de Spotly mientras navegabas. Recargar lo soluciona.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.97] cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Recargar
        </button>
      </div>
    );
  }
}
