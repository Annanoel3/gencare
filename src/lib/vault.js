import { base44 } from '@/api/base44Client';
import { withFamily } from '@/lib/family';

// The locked Legal & financial folder (Anna, Oct 29 2026: let the user set a
// password, and Base44's back end must not see anything in there).
//
// How it works: the folder has one random key. Everything in the folder is
// scrambled with that key on the phone (AES-GCM, 256-bit) before it is saved,
// so the database only ever holds ciphertext. The key itself is saved twice,
// each time locked: once with the family's password and once with a recovery
// code (PBKDF2-SHA256 turns each into a lock). The password and the recovery
// code never leave the phone, so nobody with the database (Base44, us, an AI)
// can open the folder, and nobody can reset a forgotten password either. The
// recovery code is the way back in. Changing the password only re-locks the
// key; the entries don't change.
//
// Once opened, the key lives in memory only and locks again after 10 minutes
// of not using the folder, after 5 minutes in the background, or on reload.

const VERSION = 1;
const ITERATIONS = 600000; // OWASP's PBKDF2-SHA256 figure
const RECOVERY_ITERATIONS = 100000; // the code is random, so fewer rounds are enough
const IDLE_MS = 10 * 60 * 1000;
const AWAY_MS = 5 * 60 * 1000;
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

const te = new TextEncoder();
const td = new TextDecoder();

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Is this phone able to lock things at all (needs a secure page). */
export const vaultSupported = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function lockFrom(secret, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', te.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function wrapKey(raw, secret, iterations) {
  const salt = random(16);
  const iv = random(12);
  const lock = await lockFrom(secret, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, lock, raw);
  return { salt: b64(salt), iv: b64(iv), key: b64(ct) };
}

/** The folder key's raw bytes, or throws WrongSecret. */
async function unwrapRaw(salt, iv, wrapped, secret, iterations) {
  try {
    const lock = await lockFrom(secret, unb64(salt), iterations);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, lock, unb64(wrapped)));
  } catch (e) {
    const err = new Error('wrong');
    err.code = 'wrong';
    throw err;
  }
}

const useKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** A recovery code like 7K2M-QX9D-... (24 characters, 120 random bits). */
function newRecoveryCode() {
  const bytes = random(15);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += CODE_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join('-');
}
/** Typed codes forgive dashes, spaces, lower case and O/0, I/L/1 mix-ups. */
export function cleanCode(code) {
  return String(code || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '');
}

// ---- open / locked state (memory only) ----
let opened = null; // { vaultId, key }
let idleTimer = null;
let hiddenAt = 0;
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(lockVault, IDLE_MS);
}
export function lockVault() {
  if (!opened) return;
  opened = null;
  clearTimeout(idleTimer);
  emit();
}
export const isOpen = (vault) => !!opened && !!vault && opened.vaultId === vault.id;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) lockVault();
  });
}

async function open(vault, raw) {
  opened = { vaultId: vault.id, key: await useKey(raw) };
  raw.fill(0);
  touch();
  emit();
}

// ---- the folder ----
export async function getVault() {
  const rows = await base44.entities.Vault.list('created_date', 5);
  return rows[0] || null; // one per family; if two were ever made at once, the first wins
}

/** Make the folder. Returns the recovery code to show once. */
export async function createVault(password, me) {
  const raw = random(32);
  const byPassword = await wrapKey(raw, password, ITERATIONS);
  const code = newRecoveryCode();
  const byCode = await wrapKey(raw, cleanCode(code), RECOVERY_ITERATIONS);
  const vault = await base44.entities.Vault.create(withFamily({
    version: VERSION,
    iterations: ITERATIONS,
    salt: byPassword.salt, wrapped_iv: byPassword.iv, wrapped_key: byPassword.key,
    recovery_salt: byCode.salt, recovery_iv: byCode.iv, recovery_wrapped_key: byCode.key,
    created_by_user_id: me?.id || '',
    created_by_name: me?.display_name || me?.full_name || '',
  }));
  await open(vault, raw);
  return { vault, code };
}

export async function unlockVault(vault, password) {
  const raw = await unwrapRaw(vault.salt, vault.wrapped_iv, vault.wrapped_key, password, vault.iterations || ITERATIONS);
  await open(vault, raw);
}

/** Forgot the password: the recovery code opens it and sets a new password. */
export async function recoverVault(vault, code, newPassword) {
  const raw = await unwrapRaw(vault.recovery_salt, vault.recovery_iv, vault.recovery_wrapped_key, cleanCode(code), RECOVERY_ITERATIONS);
  const byPassword = await wrapKey(raw, newPassword, ITERATIONS);
  const updated = await base44.entities.Vault.update(vault.id, { salt: byPassword.salt, wrapped_iv: byPassword.iv, wrapped_key: byPassword.key, iterations: ITERATIONS, password_changed_at: new Date().toISOString() });
  await open({ ...vault, ...updated, id: vault.id }, raw);
}

export async function changePassword(vault, current, next) {
  const raw = await unwrapRaw(vault.salt, vault.wrapped_iv, vault.wrapped_key, current, vault.iterations || ITERATIONS);
  const byPassword = await wrapKey(raw, next, ITERATIONS);
  await base44.entities.Vault.update(vault.id, { salt: byPassword.salt, wrapped_iv: byPassword.iv, wrapped_key: byPassword.key, iterations: ITERATIONS, password_changed_at: new Date().toISOString() });
  await open(vault, raw);
}

/** Erase the folder and everything in it (only whoever made it can). */
export async function eraseVault(vault) {
  const items = await base44.entities.VaultItem.filter({ vault_id: vault.id }, '-created_date', 1000);
  for (const it of items) await base44.entities.VaultItem.delete(it.id);
  await base44.entities.Vault.delete(vault.id);
  lockVault();
}

// ---- entries ----
async function seal(obj) {
  if (!opened) throw new Error('The folder is locked.');
  touch();
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, opened.key, te.encode(JSON.stringify(obj)));
  return { iv: b64(iv), data: b64(ct) };
}
async function unseal(row) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, opened.key, unb64(row.data));
  return JSON.parse(td.decode(pt));
}

/** Every entry in the folder, opened. Entries that won't open come back as { broken: true }. */
export async function listItems(vault) {
  if (!isOpen(vault)) return [];
  touch();
  const rows = await base44.entities.VaultItem.filter({ vault_id: vault.id }, '-created_date', 1000);
  const out = [];
  for (const r of rows) {
    try { out.push({ ...(await unseal(r)), id: r.id, created_date: r.created_date, updated_date: r.updated_date, created_by_name: r.created_by_name }); }
    catch (e) { out.push({ id: r.id, broken: true, created_date: r.created_date }); }
  }
  return out;
}

export async function saveItem(vault, item, id) {
  const { id: _id, broken: _b, created_date: _c, updated_date: _u, created_by_name: _n, ...plain } = item;
  const sealed = await seal({ ...plain, saved_at: new Date().toISOString() });
  if (id) return base44.entities.VaultItem.update(id, sealed);
  return base44.entities.VaultItem.create(withFamily({ ...sealed, vault_id: vault.id, version: VERSION }));
}

export const deleteItem = (id) => base44.entities.VaultItem.delete(id);

/**
 * Legal & financial entries saved before the folder existed sit in the care
 * log as plain text. Once the folder is open they move in (locked) and the
 * plain copies are deleted. Returns how many moved.
 */
export async function moveOldEntries(vault) {
  if (!isOpen(vault)) return 0;
  const old = await base44.entities.CareLog.filter({ entry_type: 'legal' }, '-timestamp', 500);
  let moved = 0;
  for (const e of old) {
    await saveItem(vault, {
      member_id: e.family_member_id || '',
      member_name: e.family_member_name || '',
      kind: e.sub_type || 'other',
      title: e.title || '',
      details: e.notes || '',
      amount: typeof e.amount === 'number' ? e.amount : '',
      date: e.date || '',
      link: e.doc_url || '',
      happened_at: e.timestamp || '',
      logged_by: e.logged_by_name || '',
    });
    await base44.entities.CareLog.delete(e.id);
    moved += 1;
  }
  return moved;
}

export const countOldEntries = async () => (await base44.entities.CareLog.filter({ entry_type: 'legal' }, '-timestamp', 500)).length;

export const KINDS = [
  ['poa', 'Power of attorney', '✍️'],
  ['will', 'Will', '📜'],
  ['insurance', 'Insurance', '🛡️'],
  ['benefit', 'Benefits', '🏛️'],
  ['bank', 'Bank & accounts', '🏦'],
  ['bill', 'Bill', '🧾'],
  ['tax', 'Taxes', '🧮'],
  ['time_off_work', 'Time off work', '🗓️'],
  ['other', 'Other', '🗂️'],
];
export const kindOf = (k) => KINDS.find(([v]) => v === k) || KINDS[KINDS.length - 1];
