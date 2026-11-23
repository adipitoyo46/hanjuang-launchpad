// lib.ts — fondasi build Hanjuang Token (agen-3).
// Ditulis khusus untuk project ini: loader .env manual, klien viem,
// dan pengirim transaksi dengan rekonsiliasi receipt yang ketat
// (transaksi yang sudah ter-broadcast TIDAK PERNAH dikirim ulang).
import { createPublicClient, createWalletClient, http, type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const STATE_FILE = path.join(ROOT, 'state.json');

// --- Konstanta jaringan & kontrak (terverifikasi dari build 16 Nov + baca on-chain) ---
export const RPC_URL = 'https://sepolia-rpc.giwa.io';
export const CHAIN_ID = 91342;
export const REGISTRY = '0x6d043014972b87406C4757a5f2d655A24e0b0aF9' as Address;
export const FACTORY = '0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA' as Address;
export const WETH = '0x4200000000000000000000000000000000000006' as Address;
export const EXPECTED_ACCOUNT = '0xf0E1E2C6E28Bee3950f6e129Bb03bA21287Cf5B6' as Address;
export const FIRST_BUY_WEI = 500_000_000_000_000n; // 0,0005 WETH — sesuai cap mandat

export const giwaSepolia = {
  id: CHAIN_ID,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const;

// --- Loader .env sederhana (tanpa dependensi tambahan) ---
function loadEnv(): Record<string, string> {
  const file = path.join(ROOT, '.env');
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv();
const pk = env['AMMORA_PRIVATE_KEY'];
if (!pk) throw new Error('AMMORA_PRIVATE_KEY tidak ada di .env');

export const account = privateKeyToAccount(pk as `0x${string}`);

// Gerbang identitas: signer HARUS wallet agen-3, dan cocok dengan AMMORA_ACCOUNT.
// Ini pelajaran dari hazard .env basi — berhenti total bila tidak cocok.
export function assertIdentity(): void {
  const configured = (env['AMMORA_ACCOUNT'] || '') as string;
  if (account.address.toLowerCase() !== EXPECTED_ACCOUNT.toLowerCase()) {
    throw new Error(`IDENTITAS SALAH: key menurunkan ${account.address}, diharapkan ${EXPECTED_ACCOUNT}. BERHENTI.`);
  }
  if (configured.toLowerCase() !== EXPECTED_ACCOUNT.toLowerCase()) {
    throw new Error(`AMMORA_ACCOUNT di .env (${configured}) != ${EXPECTED_ACCOUNT}. BERHENTI.`);
  }
}

export const publicClient = createPublicClient({ chain: giwaSepolia as any, transport: http(RPC_URL) });
export const walletClient = createWalletClient({ account, chain: giwaSepolia as any, transport: http(RPC_URL) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Kirim satu transaksi lalu tunggu receipt-nya sampai benar-benar terbaca.
// Bila receipt belum muncul setelah batas waktu, lempar error berisi hash —
// pemanggil WAJIB rekonsiliasi manual, bukan mengirim ulang.
export async function sendAndReconcile(label: string, request: Record<string, unknown>): Promise<any> {
  assertIdentity();
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
  const hash: Hash = await walletClient.sendTransaction({ ...(request as any), nonce });
  console.log(`[${label}] broadcast: ${hash} (nonce ${nonce})`);
  const deadline = Date.now() + 240_000;
  let lastErr: unknown = null;
  while (Date.now() < deadline) {
    try {
      const receipt: any = await publicClient.getTransactionReceipt({ hash });
      if (receipt) {
        console.log(`[${label}] receipt block ${receipt.blockNumber} status ${receipt.status} gasUsed ${receipt.gasUsed}`);
        if (receipt.status !== 'success') throw new Error(`[${label}] TX REVERT on-chain: ${hash}`);
        return receipt;
      }
    } catch (e: any) {
      if (/REVERT/i.test(e?.message || '')) throw e;
      lastErr = e; // receipt belum terindeks — tunggu, JANGAN kirim ulang
    }
    await sleep(4_000);
  }
  throw new Error(`[${label}] receipt belum terbaca setelah 240 dtk. Hash: ${hash}. Rekonsiliasi manual wajib; JANGAN kirim ulang. (${String(lastErr)})`);
}

// --- State antar-langkah (configId, token, curve, tx) ---
export type BuildState = Record<string, any>;
export function readState(): BuildState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
export function saveState(patch: BuildState): BuildState {
  const next = { ...readState(), ...patch };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 1));
  return next;
}
