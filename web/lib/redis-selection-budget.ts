import {randomUUID} from 'node:crypto';

export type BudgetDenial = 'concurrency' | 'shared_calls' | 'shared_estimated_cost' | 'shared_store_unavailable';
export type BudgetAdmission = { denied: BudgetDenial } | { finish(cost?: number): void | Promise<void> };
type Limits = { concurrency?: number; calls?: number; maxCny?: number; duration: number; reserve: number };
const leaseMs = 120_000;
export const sharedModelTimeoutMs = 90_000;

// One atomic operation per admission or settlement. Redis time keeps differently
// clocked application instances on the same window and lease schedule.
const script = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local window = tonumber(ARGV[3])
local lease = tonumber(ARGV[4])
local record = redis.call('GET', KEYS[1])
local state = record and cjson.decode(record) or {started = now, calls = 0, spent = 0, unknown = false, active = {}}
if now - state.started >= window then
  state.started, state.calls, state.spent, state.unknown = now, 0, 0, false
end
local count, reserved = 0, 0
for id, entry in pairs(state.active) do
  if entry.ends <= now then
    if entry.window == state.started then state.unknown = true end
    state.active[id] = nil
  else
    count = count + 1
    reserved = reserved + entry.reserve
  end
end
local function save()
  redis.call('SET', KEYS[1], cjson.encode(state), 'PX', math.ceil(window + lease))
end
local id = ARGV[2]
if ARGV[1] == 'finish' then
  local entry = state.active[id]
  if entry then
    state.active[id] = nil
    if entry.window == state.started then
      local cost = tonumber(ARGV[5])
      if cost then state.spent = state.spent + cost else state.unknown = true end
    end
  end
  save()
  return 'ok'
end
local concurrency, calls, cap, reserve = tonumber(ARGV[5]), tonumber(ARGV[6]), tonumber(ARGV[7]), tonumber(ARGV[8])
if concurrency > 0 and count + 1 > concurrency then return 'concurrency' end
if calls > 0 and state.calls + 1 > calls then return 'shared_calls' end
if cap > 0 and (state.unknown or state.spent + reserved + reserve > cap + 0.000000000001) then return 'shared_estimated_cost' end
state.calls = state.calls + 1
state.active[id] = {ends = now + lease, window = state.started, reserve = reserve}
save()
return 'ok'
`;

export async function acquireRedisSelectionBudget(limits: Limits): Promise<BudgetAdmission> {
  const url = process.env.DEEPSEEK_SELECTION_REDIS_REST_URL;
  const token = process.env.DEEPSEEK_SELECTION_REDIS_REST_TOKEN;
  const key = process.env.DEEPSEEK_SELECTION_REDIS_KEY || 'warehouse:selection-budget:v1';
  if (!url || !token) return { denied: 'shared_store_unavailable' };
  const id = randomUUID();
  const execute = async (operation: string, ...args: (string | number)[]) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(['EVAL', script, 1, key, operation, id, limits.duration, leaseMs, ...args]),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error('Shared model budget store unavailable');
    return (await response.json()).result;
  };
  try {
    const result = await execute('acquire', limits.concurrency ?? 0, limits.calls ?? 0, limits.maxCny ?? 0, limits.reserve);
    if (result === 'concurrency' || result === 'shared_calls' || result === 'shared_estimated_cost') return { denied: result };
    if (result !== 'ok') return { denied: 'shared_store_unavailable' };
  } catch {
    return { denied: 'shared_store_unavailable' };
  }
  return {
    async finish(cost?: number) {
      // A lost settlement leaves its reservation and concurrency lease in Redis.
      try { await execute('finish', cost ?? 'unknown'); } catch { /* Redis lease expires even if the process disappears. */ }
    },
  };
}
