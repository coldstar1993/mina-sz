// Live integration test against real Mina network.
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  fetchAccount,
} from 'o1js';
import { HelloWorld, adminPrivateKey } from './hello-world.js';

const zkAppKey = PrivateKey.random();
const zkAppAddress = zkAppKey.toPublicKey();
const transactionFee = 100_000_000;

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

// zkApp compilation
console.log('Compiling the smart contract.');
const { verificationKey } = await HelloWorld.compile();
const zkApp = new HelloWorld(zkAppAddress);
console.log('');

// zkApp deployment
console.log(`Deploying zkApp for public key ${zkAppAddress.toBase58()}.`);
let transaction = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    AccountUpdate.fundNewAccount(sender);
    await zkApp.deploy({ verificationKey });
  }
);

transaction.sign([senderKey, zkAppKey]);
console.log('Sending the transaction.');
let pendingTx = await transaction.send();
if (pendingTx.status === 'pending') {
  console.log(`Success! Deploy transaction sent.
Your smart contract will be deployed
as soon as the transaction is included in a block.
Txn hash: ${pendingTx.hash}`);
}
console.log('Waiting for transaction inclusion in a block.');
await pendingTx.wait({ maxAttempts: 90 });
console.log('');

// zkApp state update
console.log('Trying to update deployed zkApp state.');
transaction = await Mina.transaction(
  { sender, fee: transactionFee },
  async () => {
    await zkApp.update(Field(4), adminPrivateKey);
  }
);
await transaction.sign([senderKey]).prove();
console.log('Sending the transaction.');
pendingTx = await transaction.send();
if (pendingTx.status === 'pending') {
  console.log(`Success! Update transaction sent.
Your smart contract state will be updated
as soon as the transaction is included in a block.
Txn hash: ${pendingTx.hash}`);
}
console.log('Waiting for transaction inclusion in a block.');
await pendingTx.wait({ maxAttempts: 90 });
console.log('');

// zkApp state check
console.log('Validating zkApp state update.');
try {
  (await zkApp.x.fetch())?.assertEquals(Field(4));
} catch (error) {
  throw new Error(
    `On-chain zkApp account state doesn't match the expected state. ${error}`
  );
}
console.log('Success!');

