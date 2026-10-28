const LEASE_MS = 6 * 60 * 1000;
export const beijingDay = now => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const integer = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

// A single named object owns the global budget. Other named objects own short
// rate windows. Transactions survive restarts and serialize competing requests.
export class GardenGate {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch(request) {
    const input = await request.json();
    const result = await this.ctx.storage.transaction(async storage => {
      const now = Date.now();
      if (input.action === 'rate') {
        const windowMs = input.kind === 'login' ? 15 * 60000 : 60000;
        const limit = input.kind === 'login' ? 10 : 5;
        const times = (await storage.get('attempts') || []).filter(time => now - time < windowMs);
        if (times.length >= limit) return {status: 429, code: 'too_many_requests', retryAfter: Math.ceil((times[0] + windowMs - now) / 1000)};
        times.push(now);
        await storage.put('attempts', times);
        await storage.setAlarm(now + windowMs);
        return {status: 200};
      }
      const day = beijingDay(now);
      const state = await storage.get('budget') || {day, count: 0, leases: []};
      if (state.day !== day) { state.day = day; state.count = 0; }
      state.leases = state.leases.filter(lease => lease.expires > now);
      const limit = integer(this.env.DAILY_LIMIT, 20);
      const concurrent = integer(this.env.MAX_CONCURRENT, 2);
      let status = 200, code;
      if (input.action === 'reserve') {
        if (state.count >= limit) { status = 429; code = 'daily_limit'; }
        else if (state.leases.length >= concurrent) { status = 429; code = 'busy'; }
        else state.leases.push({id: input.id, expires: now + LEASE_MS, charged: false});
      } else if (input.action === 'charge') {
        const lease = state.leases.find(item => item.id === input.id);
        if (!lease || lease.charged) { status = 409; code = 'invalid_lease'; }
        else if (state.count >= limit) { status = 429; code = 'daily_limit'; }
        else { state.count++; lease.charged = true; }
      } else if (input.action === 'release') {
        state.leases = state.leases.filter(lease => lease.id !== input.id);
      } else if (input.action !== 'status') {
        status = 400; code = 'invalid_action';
      }
      await storage.put('budget', state);
      return {status, code, day, limit, used: state.count, remaining: Math.max(0, limit - state.count), concurrent};
    });
    return Response.json(result, {status: result.status});
  }

  async alarm() { await this.ctx.storage.delete('attempts'); }
}

export async function gate(env, name, input) {
  const object = env.GARDEN_GATE.get(env.GARDEN_GATE.idFromName(name));
  const response = await object.fetch('https://gate.internal/', {method: 'POST', body: JSON.stringify(input)});
  return response.json();
}
