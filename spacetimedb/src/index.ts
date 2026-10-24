import { schema, table, t } from 'spacetimedb/server';

// Live layer for SignalBridge. The API (port 4000) stays the source of truth;
// after each sync it pushes current shelter state + change events here so
// online clients get instant updates by subscribing.

const shelter = table(
  { name: 'shelter', public: true },
  {
    id: t.string().primaryKey(),
    name: t.string(),
    status: t.string(),          // open | full | closed | unknown
    capacity: t.i32(),           // -1 = unknown
    sourceUpdatedAt: t.string(), // ISO time from the source page, "" if unknown
    packetVersion: t.u32(),
    updatedAt: t.timestamp(),
  }
);

const changeEvent = table(
  { name: 'change_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    packetVersion: t.u32(),
    type: t.string(),            // shelter_status | shelter_capacity | ...
    shelterId: t.string(),
    oldValue: t.string(),
    newValue: t.string(),
    evidence: t.string(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ shelter, changeEvent });
export default spacetimedb;

export const upsert_shelter = spacetimedb.reducer(
  {
    id: t.string(),
    name: t.string(),
    status: t.string(),
    capacity: t.i32(),
    sourceUpdatedAt: t.string(),
    packetVersion: t.u32(),
  },
  (ctx, args) => {
    const row = { ...args, updatedAt: ctx.timestamp };
    if (ctx.db.shelter.id.find(args.id)) ctx.db.shelter.id.update(row);
    else ctx.db.shelter.insert(row);
  }
);

export const record_change = spacetimedb.reducer(
  {
    packetVersion: t.u32(),
    type: t.string(),
    shelterId: t.string(),
    oldValue: t.string(),
    newValue: t.string(),
    evidence: t.string(),
  },
  (ctx, args) => {
    ctx.db.changeEvent.insert({ id: 0n, ...args, createdAt: ctx.timestamp });
  }
);
