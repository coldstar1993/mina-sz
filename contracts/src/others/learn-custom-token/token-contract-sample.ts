import assert from 'node:assert';
import {
  method,
  Mina,
  UInt64,
  AccountUpdate,
  AccountUpdateForest,
  TokenContract,
  Int64,
  PrivateKey,
} from 'o1js';


// constant supply
const SUPPLY = UInt64.from(10n ** 18n);
export class ExampleTokenContract extends TokenContract {
  @method
  async approveBase(updates: AccountUpdateForest) {
    this.checkZeroBalanceChange(updates);
  }

  @method
  async init() {
    super.init();

    // mint the entire supply to the token account with the same address as this contract
    this.internal.mint({ address: this.address, amount: SUPPLY });
  }
}

// TESTS

let Local = await Mina.LocalBlockchain({ proofsEnabled: false });
Mina.setActiveInstance(Local);

let [sender, other] = Local.testAccounts;

let { publicKey: tokenOwnerAddress, privateKey: tokenKey } =
  PrivateKey.randomKeypair();
let token = new ExampleTokenContract(tokenOwnerAddress);
let tokenId = token.deriveTokenId();

// deploy token contract
let deployTx = await Mina.transaction(sender, async () => {
  AccountUpdate.fundNewAccount(sender, 2);
  await token.deploy();
});
await deployTx.prove();
await deployTx.sign([tokenKey, sender.key]).send();

assert(
  Mina.getAccount(tokenOwnerAddress).zkapp?.verificationKey !== undefined,
  'token contract deployed'
);

// can transfer tokens between two accounts
let transferTx = await Mina.transaction(sender, async () => {
  AccountUpdate.fundNewAccount(sender);
  await token.transfer(tokenOwnerAddress, other, UInt64.one);
});
await transferTx.prove();
await transferTx.sign([tokenKey, sender.key]).send();

Mina.getBalance(other, tokenId).assertEquals(UInt64.one);
