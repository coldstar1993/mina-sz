import {
  Field,
  PrivateKey,
  Mina,
  AccountUpdate,
  fetchAccount
} from 'o1js';
import { getProfiler } from '../utils/profiler.js';
import { VerySimpleZkapp } from './very-simple-zkapp.js';

const SimpleProfiler = getProfiler('Simple zkApp');
SimpleProfiler.start('Simple zkApp test flow');

// Network configuration
const network = Mina.Network({
  mina:'https://api.minascan.io/node/devnet/v1/graphql/',
  archive: 'https://api.minascan.io/archive/devnet/v1/graphql/'
});
Mina.setActiveInstance(network);

// Fee payer setup
const senderKey = PrivateKey.fromBase58('EKEdjFogmuzcAYVqYJZPuF8WmXVR1PBZ3oMA2ektLpeRJArkD4ne');
const sender = senderKey.toPublicKey();
// console.log(`Funding the fee payer account.`);
// await Mina.faucet(sender);// 领水

console.log(`Fetching the fee payer account information.`);
const senderAcct = await fetchAccount({ publicKey: sender });
const accountDetails = senderAcct.account;
console.log(
  `Using the fee payer account ${sender.toBase58()} with nonce: ${
    accountDetails?.nonce
  } and balance: ${accountDetails?.balance}.`
);
console.log('');

// 编译合约
console.log('compile');
console.time('compile');
await VerySimpleZkapp.compile();
console.timeEnd('compile');

// the zkapp account
let zkappAccount = Mina.TestPublicKey.random();// 需要保存好合约账户的私钥！
let zkapp = new VerySimpleZkapp(zkappAccount);

console.log('deploy');
let tx = await Mina.transaction({
  sender,
  fee: 0.1 * 10e9,
  memo: '一笔交易',
  // nonce: 2
}, async () => {
  AccountUpdate.fundNewAccount(sender);// 需要为新账户创建而花费1MINA
  zkapp.deploy();// 部署前设置合约初始状态
});
await tx.prove();
await tx.sign([senderKey, zkappAccount.key]).send();

console.log('initial state: ' + zkapp.x.get());

let account = Mina.getAccount(zkappAccount);
console.log('account state is proved:', account.zkapp?.provedState.toBoolean());

console.log('update x');

tx = await Mina.transaction(sender, async () => {
  await zkapp.update(Field(3));
});
await tx.prove();
await tx.sign([senderKey]).send();

SimpleProfiler.stop().store();
