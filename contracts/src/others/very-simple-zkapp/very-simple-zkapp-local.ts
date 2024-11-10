import {
  Field,
  state,
  State,
  method,
  UInt64,
  PrivateKey,
  SmartContract,
  Mina,
  AccountUpdate,
  Bool,
  PublicKey,
  DeployArgs,
  Permissions
} from 'o1js';
import { getProfiler } from '../utils/profiler.js';
import { VerySimpleZkapp } from "./very-simple-zkapp.js";


const SimpleProfiler = getProfiler('Simple zkApp');
SimpleProfiler.start('Simple zkApp test flow');

const doProofs = true;
let Local = await Mina.LocalBlockchain({ proofsEnabled: doProofs });
Mina.setActiveInstance(Local);

// 编译合约
if (doProofs) {
  console.log('compile');
  console.time('compile');
  await VerySimpleZkapp.compile();
  console.timeEnd('compile');
} else {
  await VerySimpleZkapp.analyzeMethods();
}

// a test account that pays all the fees, and puts additional funds into the zkapp
let [sender, payout] = Local.testAccounts;// EKEdjFogmuzcAYVqYJZPuF8WmXVR1PBZ3oMA2ektLpeRJArkD4ne

// the zkapp account
let zkappAccount = Mina.TestPublicKey.random();
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
await tx.sign([sender.key, zkappAccount.key]).send();

console.log('initial state: ' + zkapp.x.get());

let account = Mina.getAccount(zkappAccount);
console.log('account state is proved:', account.zkapp?.provedState.toBoolean());

console.log('update x');

tx = await Mina.transaction(sender, async () => {
  await zkapp.update(Field(3));
});
await tx.prove();
await tx.sign([sender.key]).send();

SimpleProfiler.stop().store();
