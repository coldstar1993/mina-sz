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
  Permissions,
  UInt32
} from 'o1js';
import { getProfiler } from './utils/profiler.js';

const doProofs = true;

// a special account that is allowed to pull out half of the zkapp balance, once
const privileged0 = Mina.TestPublicKey(
  PrivateKey.fromBase58('EKEeoESE2A41YQnSht9f7mjiKpJSeZ4jnfHXYatYi8xJdYSxWBep')
);

let initialBalance = 10_000_000_000;

class SimpleZkapp extends SmartContract {
  
  @state(PublicKey) privileged = State<PublicKey>(privileged0);

  events = { update: Field, payout: UInt64, payoutReceiver: PublicKey };

  async deploy(props?:DeployArgs) {
    await super.deploy(props)

    // 初始化合约状态
    this.privileged.set(privileged0);

    // 初始化账户权限
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible()
    })
  }

  @method
  async init() {
    super.init();
  }

  /**
   * This method allows a certain privileged account to claim half of the zkapp balance, but only once
   * @param caller the privileged account
   */
  @method
  async payout(caller: PrivateKey) {
    // 当前合约必须曾经被调用过：通常用于部署完毕后初始化、重置合约状态
    this.account.provedState.requireEquals(Bool(true));
    // check if timestamp meets
    this.network.blockchainLength.requireBetween(new UInt32(0), new UInt32(1000));

    // check that caller is the privileged account
    const privileged = this.privileged.getAndRequireEquals();
    let callerAddress = caller.toPublicKey();
    callerAddress.assertEquals(privileged);

    // assert that the caller account is new - this way, payout can only happen once
    let callerAccountUpdate = AccountUpdate.create(callerAddress);
    callerAccountUpdate.account.isNew.requireEquals(Bool(true));
    // pay out half of the zkapp balance to the caller
    let balance = this.account.balance.get();
    this.account.balance.requireEquals(balance);
    let halfBalance = balance.div(2);
    this.send({ to: callerAccountUpdate, amount: halfBalance });

    // emit some events
    this.emitEvent('payoutReceiver', callerAddress);
    this.emitEvent('payout', halfBalance);
  }
}

const SimpleProfiler = getProfiler('Simple zkApp');
SimpleProfiler.start('Simple zkApp test flow');
let Local = await Mina.LocalBlockchain({ proofsEnabled: doProofs });
Mina.setActiveInstance(Local);

// 编译合约
if (doProofs) {
  console.log('compile');
  console.time('compile');
  await SimpleZkapp.compile(); 
  console.timeEnd('compile');
} else {
  await SimpleZkapp.analyzeMethods();
}

// a test account that pays all the fees, and puts additional funds into the zkapp
let [sender, payout] = Local.testAccounts;

// the zkapp account
let zkappAccount = Mina.TestPublicKey.random();
let zkapp = new SimpleZkapp(zkappAccount);

console.log('deploy');
let tx = await Mina.transaction(sender, async () => {
  let senderUpdate = AccountUpdate.fundNewAccount(sender);
  senderUpdate.send({ to: zkappAccount, amount: initialBalance });// 转账
  zkapp.deploy();// 部署
});
await tx.prove();
await tx.sign([sender.key, zkappAccount.key]).send();

console.log(`initial balance: ${zkapp.account.balance.get().div(1e9)} MINA`);

let account = Mina.getAccount(zkappAccount);
console.log('account state is proved:', account.zkapp?.provedState.toBoolean());

// pay more into the zkapp -- this doesn't need a proof
console.log('receive');
tx = await Mina.transaction(sender, async () => {
  let payerAccountUpdate = AccountUpdate.createSigned(sender);
  payerAccountUpdate.send({ to: zkappAccount, amount: UInt64.from(8e9) });
});
await tx.sign([sender.key]).send();
console.log(`current balance: ${zkapp.account.balance.get().div(1e9)} MINA`);

console.log(`\n`);
console.log('payout');
tx = await Mina.transaction(sender, async () => {
  AccountUpdate.fundNewAccount(sender);
  await zkapp.payout(privileged0.key);
});
await tx.prove();
await tx.sign([sender.key]).send();

console.log(`final balance: ${zkapp.account.balance.get().div(1e9)} MINA`);

console.log(`\n`);
console.log('try to payout a second time..');
tx = await Mina.transaction(sender, async () => {
  await zkapp.payout(privileged0.key);
});
try {
  await tx.prove();
  await tx.sign([sender.key]).send();
} catch (err: any) {
  console.log('Transaction failed with error', err.message);
}

console.log(`\n`);
console.log('try to payout to a different account..');
try {
  tx = await Mina.transaction(sender, async () => {
    await zkapp.payout(payout.key);
  });
  await tx.prove();
  await tx.sign([sender.key]).send();
} catch (err: any) {
  console.log('Transaction failed with error', err.message);
}

console.log(`\n`);
console.log(
  `should still be the same final balance: ${zkapp.account.balance
    .get()
    .div(1e9)} MINA`
);

SimpleProfiler.stop().store();
