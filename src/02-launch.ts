// 02-launch.ts — terbitkan token Hanjuang Token (HJNG) di atas Config agen-3.
// Pola sama dengan peluncuran terbukti 16 Nov: createLaunchWithTokenConfig,
// metadataURI = creatorMetadataURI = URL GitHub Pages project ini, 9 desimal, tanpa bayar fee.
import { encodeFunctionData, parseAbi } from 'viem';
import { segmentedALCLaunchFactoryV3Abi as facAbi, segmentedBondingCurveV3Abi as curveAbi } from '@ammora-protocol/sdk';
import { account, assertIdentity, publicClient, sendAndReconcile, readState, saveState, FACTORY } from './lib.js';

export const TOKEN_NAME = 'Hanjuang Token';
export const TOKEN_SYMBOL = 'HJNG';
export const SITE_URL = 'https://adipitoyo46.github.io/hanjuang-launchpad/';
const TOKEN_DECIMALS = 9;

const erc20Abi = parseAbi(['function name() view returns (string)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)']);

assertIdentity();
const state = readState();
if (!state.configId) throw new Error('state.configId kosong — jalankan 01-config dulu.');
const configId = BigInt(state.configId);

// 1) Simulasi untuk memprediksi alamat token + curve.
const sim: any = await publicClient.simulateContract({
  address: FACTORY, abi: facAbi as any, functionName: 'createLaunchWithTokenConfig',
  args: [TOKEN_NAME, TOKEN_SYMBOL, SITE_URL, SITE_URL, configId, TOKEN_DECIMALS], account,
});
const [predictedToken, predictedCurve] = sim.result as [string, string];
console.log('simulasi OK -> token:', predictedToken, '| curve:', predictedCurve);

// 2) Kirim + rekonsiliasi.
const data = encodeFunctionData({ abi: facAbi as any, functionName: 'createLaunchWithTokenConfig', args: [TOKEN_NAME, TOKEN_SYMBOL, SITE_URL, SITE_URL, configId, TOKEN_DECIMALS] });
const receipt = await sendAndReconcile('createLaunch', { to: FACTORY, data, value: 0n });

// 3) Verifikasi: factory memetakan token<->curve, metadata token benar, curve aktif.
const curveForToken: string = await publicClient.readContract({ address: FACTORY, abi: facAbi as any, functionName: 'curveForToken', args: [predictedToken] });
const tokenForCurve: string = await publicClient.readContract({ address: FACTORY, abi: facAbi as any, functionName: 'tokenForCurve', args: [predictedCurve] });
if (curveForToken.toLowerCase() !== predictedCurve.toLowerCase() || tokenForCurve.toLowerCase() !== predictedToken.toLowerCase()) {
  throw new Error('Pemetaan token/curve di factory tidak cocok — berhenti.');
}
const [nm, sym, dec] = await Promise.all([
  publicClient.readContract({ address: predictedToken as any, abi: erc20Abi, functionName: 'name' }),
  publicClient.readContract({ address: predictedToken as any, abi: erc20Abi, functionName: 'symbol' }),
  publicClient.readContract({ address: predictedToken as any, abi: erc20Abi, functionName: 'decimals' }),
]);
const status: number = await publicClient.readContract({ address: predictedCurve as any, abi: curveAbi as any, functionName: 'status' });
const creator: string = await publicClient.readContract({ address: predictedCurve as any, abi: curveAbi as any, functionName: 'creator' });
console.log(`token terverifikasi: ${nm} (${sym}, ${dec} desimal) | curve status ${status} (1=Active) | creator ${creator}`);
if (nm !== TOKEN_NAME || sym !== TOKEN_SYMBOL || Number(status) !== 1) throw new Error('Verifikasi token/curve gagal — berhenti.');

saveState({ token: predictedToken, curve: predictedCurve, launchTx: receipt.transactionHash, tokenName: TOKEN_NAME, tokenSymbol: TOKEN_SYMBOL });
console.log('LAUNCH SELESAI. token =', predictedToken, '| curve =', predictedCurve);
