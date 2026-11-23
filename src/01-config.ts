// 01-config.ts — buat Team Config baru untuk agen-3 di registry Ammora (GIWA Sepolia).
// Parameter ekonomi meniru persis Config 39 yang terbukti (dibaca langsung dari chain),
// dengan seluruh peran (owner/partner/leftover/liquidity partner) diganti wallet agen-3.
import { encodeFunctionData, decodeEventLog } from 'viem';
import { ammoraLaunchConfigRegistryV4Abi as regAbi } from '@ammora-protocol/sdk';
import { account, assertIdentity, publicClient, sendAndReconcile, saveState, REGISTRY, EXPECTED_ACCOUNT } from './lib.js';

const OLD_WALLET = '0x208CF730320529Abfa74E990242Dd37940eb4F0b'.toLowerCase();

// Ganti setiap kemunculan wallet lama dengan wallet agen-3, rekursif, tipe data utuh.
function swapWallet(value: any): any {
  if (typeof value === 'string' && value.toLowerCase() === OLD_WALLET) return EXPECTED_ACCOUNT;
  if (Array.isArray(value)) return value.map(swapWallet);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = swapWallet(v);
    return out;
  }
  return value;
}

assertIdentity();

// 1) Ambil template Config 39 langsung dari chain (bukan dari file kode mana pun).
const templateConfig: any = await publicClient.readContract({ address: REGISTRY, abi: regAbi as any, functionName: 'get', args: [39n] });
const templateCurve: any = await publicClient.readContract({ address: REGISTRY, abi: regAbi as any, functionName: 'getCurve', args: [39n] });

const config = swapWallet(structuredClone(templateConfig));
const curve = swapWallet(structuredClone(templateCurve));

// Sanity: tidak boleh ada sisa wallet lama; quoteToken tetap WETH.
const blob = JSON.stringify([config, curve], (k, v) => (typeof v === 'bigint' ? v.toString() : v)).toLowerCase();
if (blob.includes(OLD_WALLET)) throw new Error('Masih ada wallet lama di parameter — berhenti.');
if (config.quoteToken.toLowerCase() !== '0x4200000000000000000000000000000000000006') throw new Error('quoteToken bukan WETH — berhenti.');
console.log('parameter OK: partner =', config.partnerRecipient, '| leftover =', config.leftoverReceiver, '| liqPartner =', config.liquidityDistribution.partner);

// 2) Simulasi dulu — eth_call harus sukses dan memberi tahu configId + hash hasil.
const sim: any = await publicClient.simulateContract({
  address: REGISTRY, abi: regAbi as any, functionName: 'createConfig',
  args: [config, curve, EXPECTED_ACCOUNT], account,
});
const [predictedId, predictedHash] = sim.result as [bigint, string];
console.log('simulasi OK -> configId prediksi:', predictedId.toString(), '| hash:', predictedHash);

// 3) Kirim + rekonsiliasi.
const data = encodeFunctionData({ abi: regAbi as any, functionName: 'createConfig', args: [config, curve, EXPECTED_ACCOUNT] });
const receipt = await sendAndReconcile('createConfig', { to: REGISTRY, data, value: 0n });

// 4) Verifikasi pasca-kirim: event + state terbaca ulang.
let eventId: bigint | null = null;
for (const log of receipt.logs) {
  try {
    const ev: any = decodeEventLog({ abi: regAbi as any, data: log.data, topics: log.topics });
    if (ev.eventName === 'ConfigCreatedV4' || ev.eventName === 'ConfigRegisteredV4') {
      console.log('event:', ev.eventName, JSON.stringify(ev.args, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
      if (ev.args?.configId !== undefined) eventId = BigInt(ev.args.configId);
    }
  } catch { /* log bukan milik registry */ }
}
const finalId = eventId ?? predictedId;
const identity: any = await publicClient.readContract({ address: REGISTRY, abi: regAbi as any, functionName: 'getIdentity', args: [finalId] });
const hashNow: string = await publicClient.readContract({ address: REGISTRY, abi: regAbi as any, functionName: 'configHash', args: [finalId] });
const enabled: boolean = await publicClient.readContract({ address: REGISTRY, abi: regAbi as any, functionName: 'enabled', args: [finalId] });
console.log('identity on-chain: owner =', identity.owner, '| feeClaimer =', identity.feeClaimer, '| enabled =', enabled);
if (identity.owner.toLowerCase() !== EXPECTED_ACCOUNT.toLowerCase()) throw new Error('Owner config hasil bukan agen-3 — berhenti.');
if (hashNow.toLowerCase() !== predictedHash.toLowerCase()) throw new Error('configHash tidak cocok dengan prediksi simulasi — berhenti.');

saveState({ configId: finalId.toString(), configHash: hashNow, configTx: receipt.transactionHash, configEnabled: enabled });
console.log('CONFIG SELESAI. configId =', finalId.toString());
