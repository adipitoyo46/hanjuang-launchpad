// check.ts — verifikasi identitas signer + saldo + nonce (read-only, tanpa kirim tx).
import { formatEther } from 'viem';
import { account, assertIdentity, publicClient, EXPECTED_ACCOUNT, CHAIN_ID } from './lib.js';

assertIdentity();
const chainId = await publicClient.getChainId();
const balance = await publicClient.getBalance({ address: account.address });
const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
console.log('signer        :', account.address);
console.log('expected      :', EXPECTED_ACCOUNT, '-> COCOK');
console.log('chainId       :', chainId, chainId === CHAIN_ID ? '(GIWA Sepolia OK)' : '(SALAH CHAIN!)');
console.log('saldo native  :', formatEther(balance), 'ETH');
console.log('nonce pending :', nonce);
if (chainId !== CHAIN_ID) throw new Error('Chain ID salah — berhenti.');
