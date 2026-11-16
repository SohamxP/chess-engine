import type { GameState, LegalMove } from './chess';

async function request<T>(url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error('Cannot reach the chess server. Check your connection, or retry after the service starts.');
  }
  if (!response.ok) {
    const body: { message?: string } = await response.json().catch(() => ({}));
    throw new Error(body.message || `Server returned ${response.status}.`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const api = {
  create: (playAsWhite: boolean, depth: number) => request<GameState>('/api/games', 'POST', { playAsWhite, depth }),
  move: (id: string, move: LegalMove) => request<GameState>(`/api/games/${id}/moves`, 'POST', move),
  ai: (id: string) => request<GameState>(`/api/games/${id}/ai`, 'POST'),
  undo: (id: string) => request<GameState>(`/api/games/${id}/undo`, 'POST'),
  claim: (id: string, claim: 'THREEFOLD_REPETITION' | 'FIFTY_MOVE_RULE') =>
    request<GameState>(`/api/games/${id}/claims`, 'POST', { claim }),
  resign: (id: string) => request<GameState>(`/api/games/${id}/resign`, 'POST'),
  offerDraw: (id: string) => request<{ game: GameState; accepted: boolean; message: string }>(
    `/api/games/${id}/offers/draw`, 'POST'),
  close: (id: string) => request<void>(`/api/games/${id}`, 'DELETE'),
};
