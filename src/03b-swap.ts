// 03b-swap.ts — lanjutan 03-firstbuy: wrap + approve SUDAH sukses (terverifikasi ulang di sini),
// file ini hanya mengeksekusi swap lalu verifikasi akhir.
import { encodeFunctionData, parseAbi, formatEther } from 'viem';
import { segmentedBondingCurveV3Abi as curveAbi } from '@ammora-protocol/sdk';
import { account, assertIdentity, publicClient, sendAndReconcile, readState, saveState, WETH, FIRST_BUY_WEI, EXPECTED_ACCOUNT } from './lib.js';

const wethAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)']);
const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)']);

assertIdentity();
const state = readState();
const token = state.token as `0x${string}`;
const curve = state.curve as `0x${string}`;

const wethBal: bigint = await publicClient.readContract({ address: WETH, abi: wethAbi, functionName: 'balanceOf', args: [account.address] });
const allowance: bigint = await publicClient.readContract({ address: WETH, abi: wethAbi, functionName: 'allowance', args: [account.address, curve] });
console.log('pra-swap: WETH =', wethBal.toString(), '| allowance =', allowance.toString());
if (wethBal !== FIRST_BUY_WEI || allowance !== FIRST_BUY_WEI) throw new Error('Pra-kondisi swap tidak terpenuhi — berhenti.');

const quote: any = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'quoteExactInput', args: [FIRST_BUY_WEI, false] });
const quotedOut: bigint = BigInt(quote[0]?.amountOut ?? quote.amountOut ?? 0);
if (quotedOut <= 0n) throw new Error('Quote 0 — berhenti. ' + JSON.stringify(quote, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const minOut = (quotedOut * 995n) / 1000n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
console.log('quote out:', quotedOut.toString(), '| minOut:', minOut.toString());

await publicClient.simulateContract({
  address: curve, abi: curveAbi as any, functionName: 'swapExactInput',
  args: [FIRST_BUY_WEI, minOut, false, false, EXPECTED_ACCOUNT, deadline], account,
});
console.log('simulasi swap OK');
const swapReceipt = await sendAndReconcile('swap', {
  to: curve,
  data: encodeFunctionData({ abi: curveAbi as any, functionName: 'swapExactInput', args: [FIRST_BUY_WEI, minOut, false, false, EXPECTED_ACCOUNT, deadline] }),
  value: 0n,
});

const hjngBalance: bigint = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
const status: number = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'status' });
const canonicalPool: string = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'canonicalPool' });
const quoteReserve: bigint = await publicClient.readContract({ address: curve, abi: curveAbi as any, functionName: 'quoteReserve' });
const nativeBalance = await publicClient.getBalance({ address: account.address });
console.log('saldo HJNG:', hjngBalance.toString(), 'raw | status:', status, '| canonicalPool:', canonicalPool, '| quoteReserve:', quoteReserve.toString());
console.log('saldo native akhir:', formatEther(nativeBalance), 'ETH');
if (hjngBalance < minOut) throw new Error('Saldo HJNG di bawah minOut.');
if (Number(status) !== 1) throw new Error('Curve tidak Active.');
if (canonicalPool !== '0x0000000000000000000000000000000000000000') throw new Error('Curve ter-graduasi — di luar mandat!');

saveState({
  wrapTx: '0x2e11da6d3a96fbe56dd2394f7ea2176d18a9d0c83e0eade4e05e286b127ac271',
  approveTx: '0x293c8777f100b70f74495a435af3d773b8dc4feca58d7e3c1467f861652bff70',
  swapTx: swapReceipt.transactionHash, quotedOut: quotedOut.toString(),
  hjngBalance: hjngBalance.toString(), finalNativeWei: nativeBalance.toString(),
});
console.log('SWAP SELESAI. tx =', swapReceipt.transactionHash);
