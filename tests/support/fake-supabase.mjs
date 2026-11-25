// Banco falso, em memória, com a mesma forma de uso do cliente do Supabase (from/select/eq/.../rpc/functions).
// Registra cada leitura e escrita para o teste conferir o que a função fez.

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function parseOr(expr) {
  return String(expr).split(/,(?=[a-z_]+\.(?:eq|neq|gt|gte|lt|lte|is)\.)/).map((part) => {
    const m = part.match(/^([a-z_]+)\.(eq|neq|gt|gte|lt|lte|is)\.(.*)$/);
    if (!m) return null;
    let val = m[3];
    if (val.startsWith('"')) { try { val = JSON.parse(val); } catch { /* mantém */ } }
    else if (val === 'true' || val === 'false') val = val === 'true';
    else if (val === 'null') val = null;
    else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    return { op: m[2], col: m[1], val };
  }).filter(Boolean);
}

function matches(row, filters) {
  return filters.every(({ op, col, val, any }) => {
    if (op === 'or') return any.some((f) => matches(row, [f]));
    const v = row[col];
    switch (op) {
      case 'eq': return v === val || (v != null && val != null && String(v) === String(val));
      case 'neq': return !(v === val || String(v) === String(val));
      case 'in': return val.some((x) => x === v || String(x) === String(v));
      case 'is': return val === null ? v == null : v === val;
      case 'not.is': return val === null ? v != null : v !== val;
      case 'gt': return v > val;
      case 'gte': return v >= val;
      case 'lt': return v < val;
      case 'lte': return v <= val;
      default: return true;
    }
  });
}

export function createFakeSupabase({ tables = {}, rpc = {}, functions = {}, failReads = [] } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, clone(rows)]));
  const log = { reads: [], writes: [], rpc: [], invokes: [] };
  let nextId = 1000;

  function query(table) {
    const state = { table, filters: [], action: 'select', values: null, single: null, limit: null, order: null, onConflict: null };
    const rows = () => (db[table] ||= []);

    function run() {
      const all = rows();
      if (state.action === 'select') {
        log.reads.push({ table, filters: clone(state.filters) });
        if (failReads.includes(table)) return { data: null, error: { message: 'falha simulada de leitura' } };
        let out = all.filter((r) => matches(r, state.filters));
        if (state.order) {
          const { col, asc } = state.order;
          out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (state.limit != null) out = out.slice(0, state.limit);
        return finish(out);
      }
      if (state.action === 'insert' || state.action === 'upsert') {
        const list = (Array.isArray(state.values) ? state.values : [state.values]).map((v) => ({ id: v.id ?? nextId++, ...clone(v) }));
        log.writes.push({ table, action: state.action, values: clone(list) });
        for (const item of list) {
          const keys = state.onConflict ? state.onConflict.split(',').map((s) => s.trim()) : ['id'];
          const existing = state.action === 'upsert' ? all.find((r) => keys.every((k) => String(r[k]) === String(item[k]))) : null;
          if (existing) Object.assign(existing, item); else all.push(item);
        }
        return finish(list);
      }
      if (state.action === 'update') {
        const hit = all.filter((r) => matches(r, state.filters));
        log.writes.push({ table, action: 'update', values: clone(state.values), filters: clone(state.filters), count: hit.length });
        hit.forEach((r) => Object.assign(r, clone(state.values)));
        return finish(hit);
      }
      if (state.action === 'delete') {
        const keep = all.filter((r) => !matches(r, state.filters));
        log.writes.push({ table, action: 'delete', filters: clone(state.filters), count: all.length - keep.length });
        db[table] = keep;
        return finish([]);
      }
      return { data: null, error: null };
    }

    function finish(list) {
      if (state.single === 'maybe') return { data: list[0] ? clone(list[0]) : null, error: null };
      if (state.single === 'one') return list.length === 1 ? { data: clone(list[0]), error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      return { data: clone(list), error: null, count: list.length };
    }

    const chain = {
      select() { if (state.action === 'select') state.action = 'select'; return chain; },
      insert(values) { state.action = 'insert'; state.values = values; return chain; },
      upsert(values, opts = {}) { state.action = 'upsert'; state.values = values; state.onConflict = opts.onConflict ?? null; return chain; },
      update(values) { state.action = 'update'; state.values = values; return chain; },
      delete() { state.action = 'delete'; return chain; },
      eq(col, val) { state.filters.push({ op: 'eq', col, val }); return chain; },
      neq(col, val) { state.filters.push({ op: 'neq', col, val }); return chain; },
      in(col, val) { state.filters.push({ op: 'in', col, val }); return chain; },
      is(col, val) { state.filters.push({ op: 'is', col, val }); return chain; },
      not(col, op, val) { if (op === 'is') state.filters.push({ op: 'not.is', col, val }); return chain; },
      gt(col, val) { state.filters.push({ op: 'gt', col, val }); return chain; },
      gte(col, val) { state.filters.push({ op: 'gte', col, val }); return chain; },
      lt(col, val) { state.filters.push({ op: 'lt', col, val }); return chain; },
      lte(col, val) { state.filters.push({ op: 'lte', col, val }); return chain; },
      // "a.eq.1,b.gt.0": guarda como um grupo em que basta uma condição bater
      or(expr) { state.filters.push({ op: 'or', any: parseOr(expr) }); return chain; },
      ilike() { return chain; },
      filter() { return chain; },
      contains() { return chain; },
      order(col, opts = {}) { state.order = { col, asc: opts.ascending !== false }; return chain; },
      limit(n) { state.limit = n; return chain; },
      range(from, to) { state.limit = to - from + 1; return chain; },
      maybeSingle() { state.single = 'maybe'; return Promise.resolve(run()); },
      single() { state.single = 'one'; return Promise.resolve(run()); },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return chain;
  }

  return {
    db,
    log,
    from: query,
    async rpc(name, args) {
      log.rpc.push({ name, args: clone(args) });
      const handler = rpc[name];
      if (!handler) return { data: null, error: null };
      try { return { data: await handler(args, db), error: null }; } catch (error) { return { data: null, error: { message: error.message } }; }
    },
    functions: {
      async invoke(name, opts = {}) {
        log.invokes.push({ name, body: clone(opts.body) });
        const handler = functions[name];
        return handler ? { data: await handler(opts.body, db), error: null } : { data: { success: true }, error: null };
      },
    },
    auth: { async getUser() { return { data: { user: null }, error: null }; } },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
  };
}
