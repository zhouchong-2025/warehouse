import {acquireRedisSelectionBudget, type BudgetAdmission} from './redis-selection-budget';

type WindowUsage = { startedAt: number; calls: number; estimatedCny: number; reservedCny: number; unpriced: boolean };
type SharedUsage = { inFlight: number; window: WindowUsage };
const runtime = globalThis as typeof globalThis & { __warehouseSelectionUsage?: SharedUsage };

function positiveEnv(name: string) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid selection budget setting: ' + name);
  return value;
}

export function acquireSharedSelectionBudget(): BudgetAdmission | Promise<BudgetAdmission> {
  const concurrency = positiveEnv('DEEPSEEK_SELECTION_MAX_CONCURRENT');
  const calls = positiveEnv('DEEPSEEK_SELECTION_MAX_CALLS_PER_WINDOW');
  const maxCny = positiveEnv('DEEPSEEK_SELECTION_MAX_PEAK_CNY_PER_WINDOW');
  if (concurrency === undefined && calls === undefined && maxCny === undefined) return { finish: (_cost?: number) => {} };
  const duration = positiveEnv('DEEPSEEK_SELECTION_WINDOW_MS') ?? 60_000;
  const reserve = maxCny === undefined ? 0 : positiveEnv('DEEPSEEK_SELECTION_RESERVE_PEAK_CNY_PER_CALL') ?? maxCny;
  if (process.env.DEEPSEEK_SELECTION_REDIS_REST_URL || process.env.DEEPSEEK_SELECTION_REDIS_REST_TOKEN || process.env.VERCEL === '1') {
    return acquireRedisSelectionBudget({ concurrency, calls, maxCny, duration, reserve });
  }
  const now = Date.now();
  const emptyWindow = () => ({ startedAt: now, calls: 0, estimatedCny: 0, reservedCny: 0, unpriced: false });
  const shared = runtime.__warehouseSelectionUsage ??= { inFlight: 0, window: emptyWindow() };
  if (now - shared.window.startedAt >= duration) shared.window = emptyWindow();
  const window = shared.window;
  if (concurrency !== undefined && shared.inFlight + 1 > concurrency) return { denied: 'concurrency' } as const;
  if (calls !== undefined && window.calls + 1 > calls) return { denied: 'shared_calls' } as const;
  if (maxCny !== undefined && (window.unpriced || window.estimatedCny + window.reservedCny + reserve > maxCny + 1e-12)) {
    return { denied: 'shared_estimated_cost' } as const;
  }
  shared.inFlight++;
  window.calls++;
  window.reservedCny += reserve;
  return {
    finish(cost?: number) {
      shared.inFlight--;
      window.reservedCny -= reserve;
      if (cost === undefined) window.unpriced = true;
      else window.estimatedCny += cost;
    },
  };
}
