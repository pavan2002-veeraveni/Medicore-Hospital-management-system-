// =============================================================================
// MediCore API Tests - Stateful In-Memory Prisma Test Double
// =============================================================================
// Provides relational CRUD, transactions, uniqueness checks, overlap checks,
// and failure injection for testing the full Express + Service stack locally
// without requiring live PostgreSQL credentials.

import { v4 as uuidv4 } from 'uuid';

type Row = Record<string, any>;

function matchesWhere(row: Row, where: Record<string, any> | undefined, state: InMemoryStore): boolean {
  if (!where) return true;

  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.every((sub) => matchesWhere(row, sub, state))) return false;
      continue;
    }
    if (key === 'OR') {
      const list = Array.isArray(cond) ? cond : [cond];
      if (!list.some((sub) => matchesWhere(row, sub, state))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (matchesWhere(row, cond, state)) return false;
      continue;
    }

    // Handle nested relation filters
    if (key === 'user' && row.userId) {
      const user = state.tables.user.find((u) => u.id === row.userId);
      if (!user || !matchesWhere(user, cond, state)) return false;
      continue;
    }
    if (key === 'patient' && row.patientId) {
      const patient = state.tables.patient.find((p) => p.id === row.patientId);
      if (!patient || !matchesWhere(patient, cond, state)) return false;
      continue;
    }
    if (key === 'encounter' && row.encounterId) {
      const encounter = state.tables.encounter.find((e) => e.id === row.encounterId);
      if (!encounter || !matchesWhere(encounter, cond, state)) return false;
      continue;
    }
    if (key === 'labOrder' && row.labOrderId) {
      const labOrder = state.tables.labOrder.find((o) => o.id === row.labOrderId);
      if (!labOrder || !matchesWhere(labOrder, cond, state)) return false;
      continue;
    }
    if (key === 'labOrderItem' && row.labOrderItemId) {
      const item = state.tables.labOrderItem.find((i) => i.id === row.labOrderItemId);
      if (!item || !matchesWhere(item, cond, state)) return false;
      continue;
    }
    if (key === 'role' && row.roleId) {
      const role = state.tables.role.find((r) => r.id === row.roleId);
      if (!role || !matchesWhere(role, cond, state)) return false;
      continue;
    }
    if (key === 'userRoles') {
      if (cond?.some) {
        const roles = state.tables.userRole.filter((ur) => ur.userId === row.id);
        if (!roles.some((ur) => matchesWhere(ur, cond.some, state))) return false;
      }
      continue;
    }

    const val = row[key];

    if (cond === null || typeof cond !== 'object' || cond instanceof Date) {
      const v1 = val instanceof Date ? val.getTime() : val;
      const v2 = cond instanceof Date ? cond.getTime() : cond;
      if (v1 !== v2) return false;
      continue;
    }

    // Composite unique key lookup e.g. resource_action
    if (key === 'resource_action') {
      if (row.resource !== cond.resource || row.action !== cond.action) return false;
      continue;
    }

    if ('equals' in cond) {
      if (cond.mode === 'insensitive' && typeof val === 'string' && typeof cond.equals === 'string') {
        if (val.toLowerCase() !== cond.equals.toLowerCase()) return false;
      } else if (val !== cond.equals) return false;
    }
    if ('contains' in cond) {
      const hay = String(val ?? '');
      const needle = String(cond.contains ?? '');
      if (cond.mode === 'insensitive') {
        if (!hay.toLowerCase().includes(needle.toLowerCase())) return false;
      } else if (!hay.includes(needle)) return false;
    }
    if ('startsWith' in cond) {
      if (!String(val ?? '').startsWith(String(cond.startsWith))) return false;
    }
    if ('in' in cond) {
      if (!cond.in.includes(val)) return false;
    }
    if ('notIn' in cond) {
      if (cond.notIn.includes(val)) return false;
    }
    if ('not' in cond) {
      if (val === cond.not) return false;
    }
    if ('gt' in cond || 'gte' in cond || 'lt' in cond || 'lte' in cond) {
      const numVal = val instanceof Date ? val.getTime() : Number(val);
      if (val === null || val === undefined) return false;
      if ('gt' in cond) {
        const cmp = cond.gt instanceof Date ? cond.gt.getTime() : Number(cond.gt);
        if (!(numVal > cmp)) return false;
      }
      if ('gte' in cond) {
        const cmp = cond.gte instanceof Date ? cond.gte.getTime() : Number(cond.gte);
        if (!(numVal >= cmp)) return false;
      }
      if ('lt' in cond) {
        const cmp = cond.lt instanceof Date ? cond.lt.getTime() : Number(cond.lt);
        if (!(numVal < cmp)) return false;
      }
      if ('lte' in cond) {
        const cmp = cond.lte instanceof Date ? cond.lte.getTime() : Number(cond.lte);
        if (!(numVal <= cmp)) return false;
      }
    }
  }
  return true;
}

function hydrateRow(
  tableName: string,
  row: Row | null,
  args: { include?: Record<string, any>; select?: Record<string, any> } | undefined,
  state: InMemoryStore
): any {
  if (!row) return null;
  let result: Row = { ...row };

  if (args?.select) {
    const selected: Row = {};
    for (const [k, v] of Object.entries(args.select)) {
      if (v === true) {
        selected[k] = row[k];
      } else if (v && typeof v === 'object') {
        selected[k] = hydrateRelation(tableName, k, row, v, state);
      }
    }
    return selected;
  }

  if (args?.include) {
    for (const [k, v] of Object.entries(args.include)) {
      if (v) {
        result[k] = hydrateRelation(tableName, k, row, v === true ? {} : v, state);
      }
    }
  }
  return result;
}

function hydrateRelation(
  tableName: string,
  relName: string,
  row: Row,
  subArgs: Record<string, any>,
  state: InMemoryStore
): any {
  if (relName === '_count') {
    if (tableName === 'department') {
      return { staff: state.tables.staff.filter((s) => s.departmentId === row.id).length };
    }
    if (tableName === 'laboratoryTest') {
      return { labOrderItems: state.tables.labOrderItem.filter((i) => i.testId === row.id).length };
    }
    return {};
  }
  if (relName === 'user') {
    const u = state.tables.user.find((x) => x.id === row.userId) ?? null;
    return hydrateRow('user', u, subArgs, state);
  }
  if (relName === 'actor') {
    const u = state.tables.user.find((x) => x.id === row.actorId) ?? null;
    return hydrateRow('user', u, subArgs, state);
  }
  if (relName === 'role') {
    const r = state.tables.role.find((x) => x.id === row.roleId) ?? null;
    return hydrateRow('role', r, subArgs, state);
  }
  if (relName === 'userRoles') {
    return state.tables.userRole
      .filter((ur) => ur.userId === row.id)
      .map((ur) => hydrateRow('userRole', ur, subArgs, state));
  }
  if (relName === 'patient') {
    const p =
      tableName === 'user'
        ? state.tables.patient.find((x) => x.userId === row.id) ?? null
        : state.tables.patient.find((x) => x.id === row.patientId) ?? null;
    return hydrateRow('patient', p, subArgs, state);
  }
  if (relName === 'staff') {
    if (tableName === 'user') {
      const s = state.tables.staff.find((x) => x.userId === row.id) ?? null;
      return hydrateRow('staff', s, subArgs, state);
    }
    if (tableName === 'department') {
      return state.tables.staff
        .filter((x) => x.departmentId === row.id && matchesWhere(x, subArgs.where, state))
        .map((x) => hydrateRow('staff', x, subArgs, state));
    }
    const s = state.tables.staff.find((x) => x.id === row.staffId) ?? null;
    return hydrateRow('staff', s, subArgs, state);
  }
  if (relName === 'doctor' || relName === 'prescriber') {
    const fk = relName === 'doctor' ? row.doctorId : row.prescriberId;
    const s = state.tables.staff.find((x) => x.id === fk) ?? null;
    return hydrateRow('staff', s, subArgs, state);
  }
  if (relName === 'department') {
    const d = state.tables.department.find((x) => x.id === row.departmentId) ?? null;
    return hydrateRow('department', d, subArgs, state);
  }
  if (relName === 'contacts') {
    return state.tables.patientContact
      .filter((c) => c.patientId === row.id)
      .map((c) => hydrateRow('patientContact', c, subArgs, state));
  }
  if (relName === 'schedules') {
    return state.tables.doctorSchedule
      .filter((s) => s.staffId === row.id && matchesWhere(s, subArgs.where, state))
      .map((s) => hydrateRow('doctorSchedule', s, subArgs, state));
  }
  if (relName === 'appointment') {
    const a = state.tables.appointment.find((x) => x.id === row.appointmentId) ?? null;
    return hydrateRow('appointment', a, subArgs, state);
  }
  if (relName === 'encounter') {
    const e = state.tables.encounter.find((x) => x.id === row.encounterId) ?? null;
    return hydrateRow('encounter', e, subArgs, state);
  }
  if (relName === 'vitalSigns') {
    return state.tables.vitalSign
      .filter((v) => v.encounterId === row.id)
      .map((v) => hydrateRow('vitalSign', v, subArgs, state));
  }
  if (relName === 'diagnoses') {
    return state.tables.diagnosis
      .filter((d) => d.encounterId === row.id)
      .map((d) => hydrateRow('diagnosis', d, subArgs, state));
  }
  if (relName === 'prescriptions') {
    return state.tables.prescription
      .filter((p) => p.encounterId === row.id)
      .map((p) => hydrateRow('prescription', p, subArgs, state));
  }
  if (relName === 'labOrders') {
    return state.tables.labOrder
      .filter((o) => o.encounterId === row.id)
      .map((o) => hydrateRow('labOrder', o, subArgs, state));
  }
  if (relName === 'items') {
    if (tableName === 'prescription') {
      return state.tables.prescriptionItem
        .filter((i) => i.prescriptionId === row.id)
        .map((i) => hydrateRow('prescriptionItem', i, subArgs, state));
    }
    if (tableName === 'labOrder') {
      return state.tables.labOrderItem
        .filter((i) => i.labOrderId === row.id)
        .map((i) => hydrateRow('labOrderItem', i, subArgs, state));
    }
    if (tableName === 'invoice') {
      return state.tables.invoiceItem
        .filter((i) => i.invoiceId === row.id)
        .map((i) => hydrateRow('invoiceItem', i, subArgs, state));
    }
  }
  if (relName === 'medication') {
    const m = state.tables.medicationCatalog.find((x) => x.id === row.medicationId) ?? null;
    return hydrateRow('medicationCatalog', m, subArgs, state);
  }
  if (relName === 'test') {
    const t = state.tables.laboratoryTest.find((x) => x.id === row.testId) ?? null;
    return hydrateRow('laboratoryTest', t, subArgs, state);
  }
  if (relName === 'labOrder') {
    const o = state.tables.labOrder.find((x) => x.id === row.labOrderId) ?? null;
    return hydrateRow('labOrder', o, subArgs, state);
  }
  if (relName === 'labOrderItem') {
    const i = state.tables.labOrderItem.find((x) => x.id === row.labOrderItemId) ?? null;
    return hydrateRow('labOrderItem', i, subArgs, state);
  }
  if (relName === 'result') {
    const r = state.tables.labResult.find((x) => x.labOrderItemId === row.id) ?? null;
    return hydrateRow('labResult', r, subArgs, state);
  }
  if (relName === 'payments') {
    return state.tables.payment
      .filter((p) => p.invoiceId === row.id)
      .map((p) => hydrateRow('payment', p, subArgs, state));
  }
  if (relName === 'invoice') {
    const inv = state.tables.invoice.find((x) => x.id === row.invoiceId) ?? null;
    return hydrateRow('invoice', inv, subArgs, state);
  }
  if (relName === 'history') {
    return state.tables.consentHistory
      .filter((h) => h.consentId === row.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((h) => hydrateRow('consentHistory', h, subArgs, state));
  }
  return null;
}

export class InMemoryStore {
  public simulateDbFailure = false;
  public tables: Record<string, Row[]> = {};
  private txLock: Promise<void> = Promise.resolve();

  constructor() {
    this.reset();
  }

  reset() {
    this.simulateDbFailure = false;
    this.tables = {
      user: [],
      role: [],
      permission: [],
      userRole: [],
      rolePermission: [],
      refreshToken: [],
      patient: [],
      patientContact: [],
      department: [],
      staff: [],
      doctorSchedule: [],
      appointment: [],
      encounter: [],
      vitalSign: [],
      diagnosis: [],
      medicationCatalog: [],
      prescription: [],
      prescriptionItem: [],
      laboratoryTest: [],
      labOrder: [],
      labOrderItem: [],
      labResult: [],
      invoice: [],
      invoiceItem: [],
      payment: [],
      consent: [],
      consentHistory: [],
      auditLog: [],
      notification: [],
      notificationJob: [],
      fhirSyncRecord: [],
      idempotencyRecord: [],
    };
  }

  private createDelegate(tableName: string) {
    const state = this;
    const assertConnected = () => {
      if (state.simulateDbFailure) {
        throw new Error('ECONNREFUSED: PostgreSQL connection unavailable');
      }
    };

    const insertRow = (data: Record<string, any>): Row => {
      const now = new Date();
      const id = data.id || uuidv4();
      const base: Row = {
        id,
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
        isActive: data.isActive !== undefined ? data.isActive : true,
        ...data,
      };

      // Handle nested create for items (prescriptionItems, labOrderItems, invoiceItems)
      if (tableName === 'prescription' && data.items?.create) {
        const items = Array.isArray(data.items.create) ? data.items.create : [data.items.create];
        delete base.items;
        for (const item of items) {
          state.tables.prescriptionItem.push({
            id: uuidv4(),
            prescriptionId: id,
            createdAt: now,
            updatedAt: now,
            ...item,
          });
        }
      }
      if (tableName === 'labOrder' && data.items?.create) {
        const items = Array.isArray(data.items.create) ? data.items.create : [data.items.create];
        delete base.items;
        for (const item of items) {
          state.tables.labOrderItem.push({
            id: uuidv4(),
            labOrderId: id,
            status: item.status || 'PENDING',
            createdAt: now,
            updatedAt: now,
            ...item,
          });
        }
      }
      if (tableName === 'invoice' && data.items?.create) {
        const items = Array.isArray(data.items.create) ? data.items.create : [data.items.create];
        delete base.items;
        for (const item of items) {
          state.tables.invoiceItem.push({
            id: uuidv4(),
            invoiceId: id,
            createdAt: now,
            updatedAt: now,
            ...item,
          });
        }
      }

      // Enforce defaults matching Prisma schema
      if (tableName === 'user') {
        base.emailVerified = data.emailVerified ?? false;
        base.lastLoginAt = data.lastLoginAt ?? null;
      }
      if (tableName === 'doctorSchedule') {
        base.validUntil = data.validUntil ?? null;
        base.slotDuration = data.slotDuration ?? 30;
      }
      if (tableName === 'consent') {
        base.expiresAt = data.expiresAt ?? null;
        base.revokedAt = data.revokedAt ?? null;
      }
      if (tableName === 'appointment') {
        base.status = data.status ?? 'REQUESTED';
        base.type = data.type ?? 'CONSULTATION';
        base.priority = data.priority ?? 0;
        // Simulate PostgreSQL EXCLUDE USING gist constraint
        const blocking = ['REQUESTED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'];
        if (blocking.includes(base.status)) {
          const conflict = state.tables.appointment.find(
            (a) =>
              a.doctorId === base.doctorId &&
              blocking.includes(a.status) &&
              new Date(a.scheduledStart) < new Date(base.scheduledEnd) &&
              new Date(a.scheduledEnd) > new Date(base.scheduledStart)
          );
          if (conflict) {
            const err: any = new Error('Exclusion constraint appointments_no_doctor_overlap violated (23P01)');
            err.meta = { code: '23P01' };
            throw err;
          }
        }
      }
      if (tableName === 'encounter') {
        base.startedAt = data.startedAt ?? now;
      }
      if (tableName === 'vitalSign') {
        base.recordedAt = data.recordedAt ?? now;
      }
      if (tableName === 'diagnosis') {
        base.diagnosedAt = data.diagnosedAt ?? now;
      }
      if (tableName === 'prescription') {
        base.status = data.status ?? 'ACTIVE';
        base.prescribedAt = data.prescribedAt ?? now;
      }
      if (tableName === 'labOrder') {
        base.orderedAt = data.orderedAt ?? now;
      }
      if (tableName === 'labResult') {
        base.resultedAt = data.resultedAt ?? now;
        base.validatedAt = data.validatedAt ?? null;
        base.validatedBy = data.validatedBy ?? null;
      }
      if (tableName === 'notification') {
        base.isRead = data.isRead ?? false;
        base.readAt = data.readAt ?? null;
      }
      if (tableName === 'notificationJob') {
        base.attempts = data.attempts ?? 0;
        base.maxAttempts = data.maxAttempts ?? 3;
      }

      state.tables[tableName].push(base);
      return base;
    };

    const sortRows = (rows: Row[], orderBy: any): Row[] => {
      if (!orderBy) return rows;
      const list = Array.isArray(orderBy) ? orderBy : [orderBy];
      return [...rows].sort((a, b) => {
        for (const clause of list) {
          const [field, dir] = Object.entries(clause)[0] as [string, 'asc' | 'desc'];
          const va = a[field] instanceof Date ? a[field].getTime() : a[field];
          const vb = b[field] instanceof Date ? b[field].getTime() : b[field];
          if (va < vb) return dir === 'asc' ? -1 : 1;
          if (va > vb) return dir === 'asc' ? 1 : -1;
        }
        return 0;
      });
    };

    return {
      findUnique: async (args: any) => {
        assertConnected();
        const found = state.tables[tableName].find((r) => matchesWhere(r, args.where, state)) ?? null;
        return hydrateRow(tableName, found, args, state);
      },
      findUniqueOrThrow: async (args: any) => {
        assertConnected();
        const found = state.tables[tableName].find((r) => matchesWhere(r, args.where, state));
        if (!found) throw new Error(`Record not found in ${tableName}`);
        return hydrateRow(tableName, found, args, state);
      },
      findFirst: async (args: any = {}) => {
        assertConnected();
        let rows = state.tables[tableName].filter((r) => matchesWhere(r, args.where, state));
        rows = sortRows(rows, args.orderBy);
        return hydrateRow(tableName, rows[0] ?? null, args, state);
      },
      findMany: async (args: any = {}) => {
        assertConnected();
        let rows = state.tables[tableName].filter((r) => matchesWhere(r, args.where, state));
        rows = sortRows(rows, args.orderBy);
        if (typeof args.skip === 'number') rows = rows.slice(args.skip);
        if (typeof args.take === 'number') rows = rows.slice(0, args.take);
        return rows.map((r) => hydrateRow(tableName, r, args, state));
      },
      count: async (args: any = {}) => {
        assertConnected();
        return state.tables[tableName].filter((r) => matchesWhere(r, args.where, state)).length;
      },
      create: async (args: any) => {
        assertConnected();
        const row = insertRow(args.data);
        return hydrateRow(tableName, row, args, state);
      },
      createMany: async (args: any) => {
        assertConnected();
        const items = Array.isArray(args.data) ? args.data : [args.data];
        for (const item of items) insertRow(item);
        return { count: items.length };
      },
      update: async (args: any) => {
        assertConnected();
        const idx = state.tables[tableName].findIndex((r) => matchesWhere(r, args.where, state));
        if (idx === -1) throw new Error(`Record not found in ${tableName}`);
        const updated = { ...state.tables[tableName][idx], ...args.data, updatedAt: new Date() };
        state.tables[tableName][idx] = updated;
        return hydrateRow(tableName, updated, args, state);
      },
      updateMany: async (args: any) => {
        assertConnected();
        let count = 0;
        state.tables[tableName] = state.tables[tableName].map((r) => {
          if (matchesWhere(r, args.where, state)) {
            count++;
            return { ...r, ...args.data, updatedAt: new Date() };
          }
          return r;
        });
        return { count };
      },
      upsert: async (args: any) => {
        assertConnected();
        const idx = state.tables[tableName].findIndex((r) => matchesWhere(r, args.where, state));
        if (idx >= 0) {
          const updated = { ...state.tables[tableName][idx], ...args.update, updatedAt: new Date() };
          state.tables[tableName][idx] = updated;
          return hydrateRow(tableName, updated, args, state);
        }
        const created = insertRow(args.create);
        return hydrateRow(tableName, created, args, state);
      },
      delete: async (args: any) => {
        assertConnected();
        const idx = state.tables[tableName].findIndex((r) => matchesWhere(r, args.where, state));
        if (idx === -1) throw new Error(`Record not found in ${tableName}`);
        const [removed] = state.tables[tableName].splice(idx, 1);
        return hydrateRow(tableName, removed, args, state);
      },
      deleteMany: async (args: any = {}) => {
        assertConnected();
        const before = state.tables[tableName].length;
        state.tables[tableName] = state.tables[tableName].filter((r) => !matchesWhere(r, args.where, state));
        return { count: before - state.tables[tableName].length };
      },
    };
  }

  get client(): any {
    const store = this;
    const proxy: Record<string, any> = {};
    for (const tableName of Object.keys(this.tables)) {
      proxy[tableName] = this.createDelegate(tableName);
    }

    // Serialize transaction execution to mirror PostgreSQL Serializable lock ordering
    proxy.$transaction = async (arg: any) => {
      if (store.simulateDbFailure) {
        throw new Error('ECONNREFUSED: PostgreSQL connection unavailable');
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      const prev = store.txLock;
      let release!: () => void;
      store.txLock = new Promise<void>((res) => {
        release = res;
      });
      await prev;
      try {
        return await arg(proxy);
      } finally {
        release();
      }
    };

    proxy.$queryRaw = async () => {
      if (store.simulateDbFailure) {
        throw new Error('ECONNREFUSED: PostgreSQL connection unavailable');
      }
      return [{ '?column?': 1 }];
    };

    proxy.$disconnect = async () => {};
    proxy.$on = () => {};
    return proxy;
  }
}
