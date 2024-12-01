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
  UInt32,
  Provable,
  Poseidon
} from 'o1js';
import { getProfiler } from './utils/profiler.js';

const doProofs = true;

// a special account that is allowed to pull out half of the zkapp balance, once
const privilegedAcct = Mina.TestPublicKey(
  PrivateKey.fromBase58('EKEeoESE2A41YQnSht9f7mjiKpJSeZ4jnfHXYatYi8xJdYSxWBep')
);
console.log(`privilegedAcct address: ${privilegedAcct.toBase58()}`);

const preimage0 = Field(1234567);
const hash0 = Poseidon.hash([preimage0]);

let initialBalance = 10_000_000_000;

class SimpleZkapp extends SmartContract {

  @state(Field) hashX = State<Field>(hash0);

  events = { update: Field, payout: UInt64, payoutReceiver: PublicKey };

  async deploy(props?: DeployArgs) {
    await super.deploy(props)

    // 初始化合约状态
    this.hashX.set(hash0);

    // 初始化账户权限
    this.account.permissions.set({
      ...Permissions.default(),
      send: Permissions.proof(),
      setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible()
    })
  }

  /**
   * This method allows a certain privileged account to claim half of the zkapp balance, but only once
   * @param caller the privileged account
   */
  @method
  async payout(preimage: Field, privilegedAddr: PublicKey) {
    // check if blockchainLength meets
    this.network.blockchainLength.requireBetween(new UInt32(0), new UInt32(1000));

    // check that caller is the privileged account
    const hashX = this.hashX.getAndRequireEquals();
    let hash1 = Poseidon.hash([preimage]);
    hash1.assertEquals(hashX);

    // pay out the zkapp balance to the caller
    let balance = this.account.balance.getAndRequireEquals();
    let halfBalance = balance.div(2);

    const recieverAcctUpt = AccountUpdate.createSigned(privilegedAddr);
    recieverAcctUpt.account.isNew.requireEquals(Bool(true));
    this.send({ to: recieverAcctUpt, amount: halfBalance });

    // !!!vesting schedule!!!
    recieverAcctUpt.account.timing.set({
      initialMinimumBalance: halfBalance,
      cliffTime: new UInt32(50),
      cliffAmount: halfBalance.mul(2).div(10),// Tips: 除法会丢掉余数的
      vestingPeriod: new UInt32(100),
      vestingIncrement: halfBalance.div(10),
    });

    // emit some events
    this.emitEvent('payoutReceiver', privilegedAddr);
    this.emitEvent('payout', balance);
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

console.log('deploy...');
let tx = await Mina.transaction(sender, async () => {
  AccountUpdate.fundNewAccount(sender);
  zkapp.deploy();// 部署
});
// await tx.prove();
await tx.sign([sender.key, zkappAccount.key]).send();

console.log(`initial balance: ${zkapp.account.balance.get().div(1e9)} MINA`);


// pay more into the zkapp -- this doesn't need a proof
console.log('receive...');
tx = await Mina.transaction(sender, async () => {
  let payerAccountUpdate = AccountUpdate.createSigned(sender);
  payerAccountUpdate.send({ to: zkappAccount, amount: UInt64.from(200e9) });// 100MINA
});
await tx.sign([sender.key]).send();
console.log(`current balance of zkapp: ${zkapp.account.balance.get().div(1e9)} MINA`);

console.log(`\n`);
console.log('payout...');
tx = await Mina.transaction(sender, async () => {
  AccountUpdate.fundNewAccount(sender);
  await zkapp.payout(preimage0, privilegedAcct);
});
await tx.prove();
await tx.sign([sender.key, privilegedAcct.key]).send();
console.log(`final balance of zkapp: ${zkapp.account.balance.get().div(1e9)} MINA`);

let privilegedAcctBalance = Mina.getBalance(privilegedAcct);
console.log('\n------------------------------');
console.log(`privilegedAcct Balance: ${privilegedAcctBalance.div(1e9).toString()}`);
console.log('vesting schedule:');
console.log('  after 50 slots: 释放 20 MINA');
console.log('  after 150 slots: 释放 10 MINA');
console.log('  after 250 slots: 释放 10 MINA');
console.log('    ...        ');
console.log('------------------------------\n');

console.log(`currentSlot: ${Local.getNetworkState().globalSlotSinceGenesis}`);
console.log(`\n==== 在CliffTime之内，测试转账(应失败) ====`);
try {
  const anotherGuyAddr = PrivateKey.random().toPublicKey();
  tx = await Mina.transaction(privilegedAcct, async () => {
    AccountUpdate.fundNewAccount(privilegedAcct);// 消耗1MINA用于创建新账户

    const acctUpdate = AccountUpdate.createSigned(privilegedAcct);
    acctUpdate.send({ to: anotherGuyAddr, amount: 1 * 1e9 });
  });
  await tx.sign([privilegedAcct.key]).send();

  console.log(`transfer successfully!`);
} catch (error) {
  console.log(`transfer failed!`);

  console.log(error);
}

console.log(`\n==== 在CliffTime之后，测试转账(应成功) ====`);
Local.incrementGlobalSlot(50);
console.log(`currentSlot: ${Local.getNetworkState().globalSlotSinceGenesis}`);
try {
  const anotherGuyAddr = PrivateKey.random().toPublicKey();
  console.log(`the balance of privilegedAcct: ${Mina.getBalance(privilegedAcct).div(1e9)} MINA`);

  tx = await Mina.transaction(privilegedAcct, async () => {
    AccountUpdate.fundNewAccount(privilegedAcct);// 消耗1MINA用于创建新账户
    const senderAcctUpdate = AccountUpdate.createSigned(privilegedAcct);
    senderAcctUpdate.send({ to: anotherGuyAddr, amount: privilegedAcctBalance.mul(16).div(100) });// 剩余部分用于后面的交易案例里支付手续费
  });
  await tx.sign([privilegedAcct.key]).send();

  console.log(`transfer successfully!`);

  console.log(` the balance of privilegedAcct: ${Mina.getBalance(privilegedAcct).div(1e9)} MINA`);
  console.log(` the balance of anotherGuyAddr: ${Mina.getBalance(anotherGuyAddr).div(1e9)} MINA`);

} catch (error) {
  console.log(`transfer failed!`);

  console.log(error);
}

console.log(`\n==== 未达第一个vestingPeriod时，测试转账(应失败) ====`);
Local.incrementGlobalSlot(99);// i.e. 来到第 149 slot
console.log(`currentSlot: ${Local.getNetworkState().globalSlotSinceGenesis}`);
try {
  const anotherGuyAddr = PrivateKey.random().toPublicKey();

  tx = await Mina.transaction(privilegedAcct, async () => {
    AccountUpdate.fundNewAccount(privilegedAcct);// 消耗1MINA用于创建新账户

    const acctUpdate = AccountUpdate.createSigned(privilegedAcct);
    acctUpdate.send({ to: anotherGuyAddr, amount: 10e9 });
  });
  await tx.sign([privilegedAcct.key]).send();

  console.log(`transfer successfully!`);
} catch (error) {
  console.log(`transfer failed!`);

  console.log(error);
}

console.log(`\n==== 达到第一个vestingPeriod时，测试转账(应成功) ====`);
Local.incrementGlobalSlot(1);// i.e. 来到第 150 slot
console.log(`currentSlot: ${Local.getNetworkState().globalSlotSinceGenesis}`);
// 测试转币
try {
  const anotherGuyAddr = PrivateKey.random().toPublicKey();

  privilegedAcctBalance = Mina.getBalance(privilegedAcct);
  tx = await Mina.transaction(privilegedAcct, async () => {
    AccountUpdate.fundNewAccount(privilegedAcct);// 消耗1MINA用于创建新账户

    const acctUpdate = AccountUpdate.createSigned(privilegedAcct);
    acctUpdate.send({ to: anotherGuyAddr, amount: 10e9 });
  });
  await tx.sign([privilegedAcct.key]).send();

  console.log(`transfer successfully!`);
  console.log(` the balance of privilegedAcct: ${Mina.getBalance(privilegedAcct).div(1e9)}`);
  console.log(` the balance of anotherGuyAddr: ${Mina.getBalance(anotherGuyAddr).div(1e9)}`);

} catch (error) {
  console.log(`transfer failed!`);

  console.log(error);
}


SimpleProfiler.stop().store();
