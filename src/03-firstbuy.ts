// 03-firstbuy.ts — pembelian pertama HJNG: wrap ETH -> WETH, approve persis,
// lalu swapExactInput di curve. Total nilai yang keluar: tepat 0,0005 ETH + gas.
// TIDAK ada langkah graduasi di sini — curve harus tetap Active (status 1).
import { encodeFunctionData, parseAbi, formatEther } from 'viem';
import { segmentedBondingCurveV3Abi as curveAbi } from '@ammora-protocol/sdk';
import { account, assertIdentity, publicClient, sendAndReconcile, readState, saveState, WETH, FIRST_BUY_WEI, EXPECTED_ACCOUNT } from './lib.js';

const wethAbi = parseAbi(['function deposit() payable', 'function approve(address spender, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)']);
const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)']);

assertIdentity();
const state = readState();
if (!state.token || !state.curve) throw new Error('state token/curve kosong — jalankan 02-launch dulu.');
const token = state.token as `0x${string}`;
const curve = state.curve as `0x${string}`;

// --- A) Wrap 0,0005 ETH -> WETH ---
const wethBefore: bigint = await publicClient.readContract({ address: WETH, abi: wethAbi, functionName: 'balanceOf', args: [account.address] });
const wrapReceipt = await sendAndReconcile('wrap', { to: WETH, data: encodeFunctionData({ abi: wethAbi, functionName: 'deposit' }), value: FIRST_BUY_WEI });
const wethAfter: bigint = await publicClient.readContract({ address: WETH, abi: wethAbi, functionName: 'balanceOf', args: [account.address] });
console.log('WETH:', wethBefore.toString(), '->', wethAfter.toString());
if (wethAfter - wethBefore !== FIRST_BUY_WEI) throw new Error('Delta WETH dari wrap tidak persis 0,0005 — berhenti.');

// --- B) Approve WETH ke curve, persis sebesar first buy ---
const apvReceipt = await sendAndReconcile('approve', { to: WETH, data: encodeFunctionData({ abi: wethAbi, functionName: 'approve', args: [curve, FIRST_BUY_WEI] }), value: 0n });
const allowance: bigint = await publicClient.readContract({ address: WETH, abi: wethAbi, functionName: 'allowance', args: [account.address, curve] });
if (allowance !== FIRST_BUY_WEI) throw new Error('Allowance tidak persis 0,0005 WETH — berhenti.');

// --- C) Quote lalu swap ---
const quote: any = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'quoteExactInput', args: [FIRST_BUY_WEI, false] });
const quotedOut: bigint = BigInt(quote[0]?.amountOut ?? quote.amountOut ?? 0);
if (quotedOut <= 0n) throw new Error('Quote menghasilkan 0 — berhenti. Detail: ' + JSON.stringify(quote, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const minOut = (quotedOut * 995n) / 1000n; // toleransi 0,5% — sama seperti pembelian terbukti 16 Nov
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
console.log('quote out:', quotedOut.toString(), 'HJNG raw | minOut:', minOut.toString());

const sim: any = await publicClient.simulateContract({
  address: curve, abi: curveAbi as any, functionName: 'swapExactInput',
  args: [FIRST_BUY_WEI, minOut, false, false, EXPECTED_ACCOUNT, deadline], account,
});
console.log('simulasi swap OK');
const swapReceipt = await sendAndReconcile('swap', {
  to: curve,
  data: encodeFunctionData({ abi: curveAbi as any, functionName: 'swapExactInput', args: [FIRST_BUY_WEI, minOut, false, false, EXPECTED_ACCOUNT, deadline] }),
  value: 0n,
});

// --- D) Verifikasi akhir ---
const hjngBalance: bigint = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const status: number = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'status' });
const canonicalPool: string = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'canonicalPool' });
const nativeBalance = await publicClient.getBalance({ address: account.address });
console.log('saldo HJNG agen-3:', hjngBalance.toString(), 'raw');
console.log('curve status:', status, '(1=Active) | canonicalPool:', canonicalPool);
console.log('saldo native akhir:', formatEther(nativeBalance), 'ETH');
if (hjngBalance < minOut) throw new Error('Saldo HJNG di bawah minOut — berhenti.');
if (Number(status) !== 1) throw new Error('Curve tidak Active — berhenti.');
if (canonicalPool !== '0x0000000000000000000000000000000000000000') throw new Error('Curve ter-graduasi — di luar mandat!');

saveState({
  wrapTx: wrapReceipt.transactionHash, approveTx: apvReceipt.transactionHash, swapTx: swapReceipt.transactionHash,
  quotedOut: quotedOut.toString(), hjngBalance: hjngBalance.toString(), finalNativeWei: nativeBalance.toString(),
});
console.log('FIRST BUY SELESAI. swap tx =', swapReceipt.transactionHash);
