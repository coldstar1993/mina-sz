import assert from 'node:assert';
import fs from "fs";
import {
    method,
    Mina,
    UInt64,
    AccountUpdate,
    AccountUpdateForest,
    TokenContract,
    Int64,
    Permissions,
    SmartContract,
    Bool,
    DeployArgs,
    Field,
    Poseidon,
    PublicKey,
    state,
    State,
    UInt32,
    PrivateKey,
    Provable,
} from 'o1js';
import { ExampleTokenContract } from './token-contract-sample.js';

const preimage0 = Field(1234567);
const hash0 = Poseidon.hash([preimage0]);

class SimpleZkapp extends SmartContract {

    @state(Field) hashX = State<Field>(hash0);

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

    @method
    async payout(preimage: Field, privilegedAddr: PublicKey) {
        // check that caller is the privileged account
        const hashX = this.hashX.getAndRequireEquals();
        let hash1 = Poseidon.hash([preimage]);
        hash1.assertEquals(hashX);

        // pay out the zkapp balance to the caller
        let balance = this.account.balance.getAndRequireEquals();
        const recieverAcctUpt = this.send({ to: privilegedAddr, amount: balance });
        recieverAcctUpt.body.mayUseToken = AccountUpdate.MayUseToken.InheritFromParent;// MUST ADD THIS!
    }
}


let Local = await Mina.LocalBlockchain({ proofsEnabled: true });
Mina.setActiveInstance(Local);

let [sender, callerX] = Local.testAccounts;
console.log(`sender: ${sender.toBase58()}`);
console.log(`callerX: ${callerX.toBase58()}`);

let { publicKey: tokenAddress, privateKey: tokenKey } =
    PrivateKey.randomKeypair();
let tokenOwnerZkapp = new ExampleTokenContract(tokenAddress);
let tokenId = tokenOwnerZkapp.deriveTokenId();

// deploy token contract
console.log('compile ExampleTokenContract...');
await ExampleTokenContract.compile();

console.log('deploy ExampleTokenContract...');
let deployTx = await Mina.transaction(sender, async () => {
    AccountUpdate.fundNewAccount(sender, 2);
    await tokenOwnerZkapp.deploy();
});
await deployTx.prove();
await deployTx.sign([tokenKey, sender.key]).send();

assert(
    Mina.getAccount(tokenAddress).zkapp?.verificationKey !== undefined,
    'token contract deployed'
);

let zkAppKey = PrivateKey.random();
let zkAppAddr = zkAppKey.toPublicKey();
const zkAppX = new SimpleZkapp(zkAppAddr, tokenId);
console.log(`zkAppAddr: ${zkAppAddr.toBase58()}`);

console.log('compile SimpleZkapp...');
await SimpleZkapp.compile();

console.log('CASE: 部署SimpleZkapp合约时，没有经过token owner的approve(理应失败)：');
try {
    let transferTx = await Mina.transaction(sender, async () => {
        AccountUpdate.fundNewAccount(sender);
        await zkAppX.deploy();
    });
    await transferTx.sign([zkAppKey, sender.key]).send();

} catch (error) {
    console.log('没有经过token owner的approve, 部署交易失败!');
    console.error(error);
}

console.log(`\n`);

console.log('CASE: 部署SimpleZkapp合约时，得到token owner的approve(理应成功)：');
try {
    let tx = await Mina.transaction(sender, async () => {
        AccountUpdate.fundNewAccount(sender);
        await zkAppX.deploy();
        await tokenOwnerZkapp.approveAccountUpdate(zkAppX.self);// 底层调用了approveBase(*)
    });
    await tx.prove();
    await tx.sign([zkAppKey, sender.key]).send();
    console.log('得到token owner的approve, 部署交易成功!');
} catch (error) {
    console.error(error);
}

console.log(`\n`);

console.log('transfer tokens to zkAppX account...');
const transferAmt = new UInt64(100);
let transferTx = await Mina.transaction(sender, async () => {
    await tokenOwnerZkapp.transfer(tokenAddress, zkAppAddr, transferAmt);// 底层调用了approveBase(*)
});
await transferTx.prove();
await transferTx.sign([tokenKey, sender.key]).send();
console.log('zkAppX account\'s balance', Mina.getBalance(zkAppAddr, tokenId).toString());

console.log(`\n`);

console.log('payout...');
// a special account that is allowed to pull out half of the zkapp balance, once
const privilegedAcct = Mina.TestPublicKey(
    PrivateKey.random()
);
console.log(`privilegedAcct address: ${privilegedAcct.toBase58()}`);
let tx = await Mina.transaction(callerX, async () => {
    AccountUpdate.fundNewAccount(callerX);
    await zkAppX.payout(preimage0, privilegedAcct);
    await tokenOwnerZkapp.approveAccountUpdate(zkAppX.self);// 底层调用了approveBase(*)
});
const provedTx = await tx.prove();
const signedTx = provedTx.sign([callerX.key, privilegedAcct.key]);
fs.writeFileSync('./payout-tx.json', signedTx.toJSON());
await signedTx.send();

console.log(`final balance of zkappX: ${Mina.getBalance(zkAppAddr, tokenId).toString()}`);
console.log(`final balance of privilegedAcct: ${Mina.getBalance(privilegedAcct, tokenId).toString()}`);

