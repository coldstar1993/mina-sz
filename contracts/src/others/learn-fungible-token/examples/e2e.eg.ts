import { equal } from "node:assert"
import { AccountUpdate, Bool, Mina, PrivateKey, TokenId, UInt64, UInt8 } from "o1js"
import { FungibleToken } from "../FungibleToken.js"
import { FungibleTokenAdmin } from "../FungibleTokenAdmin.js"

const localChain = await Mina.LocalBlockchain({
  proofsEnabled: true,
  enforceTransactionLimits: false,
})
Mina.setActiveInstance(localChain)

console.log("FungibleTokenAdmin.compile...")
await FungibleTokenAdmin.compile();
console.log("FungibleToken.compile...")
await FungibleToken.compile();

const fee = 1e8

const [deployer, operator, alexa, billy] = localChain.testAccounts
const tokenContractKey = PrivateKey.randomKeypair()
const adminContractKey = PrivateKey.randomKeypair()

const token = new FungibleToken(tokenContractKey.publicKey)
const tokenId = TokenId.derive(tokenContractKey.publicKey);// 计算出tokenId
const adminContract = new FungibleTokenAdmin(adminContractKey.publicKey)

console.log("Deploying token contract.")
const deployTx = await Mina.transaction({
  sender: deployer,
  fee,
}, async () => {
  AccountUpdate.fundNewAccount(deployer, 3)
  await adminContract.deploy({ adminPublicKey: adminContractKey.publicKey }) //!! make adminContract account as the token Manager !!
  await token.deploy({
    symbol: "abc",
    src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
  })
  await token.initialize(
    adminContractKey.publicKey,
    UInt8.from(9),
    // We can set `startPaused` to `Bool(false)` here, because we are doing an atomic deployment
    // If you are not deploying the admin and token contracts in the same transaction,
    // it is safer to start the tokens paused, and resume them only after verifying that
    // the admin contract has been deployed
    Bool(false),
  )
})
await deployTx.prove()
deployTx.sign([deployer.key, tokenContractKey.privateKey, adminContractKey.privateKey])
const deployTxResult = await deployTx.send().then((v) => v.wait())
console.log("Deploy tx result:", deployTxResult.toPretty())
equal(deployTxResult.status, "included")

const alexaBalanceBeforeMint = (await token.getBalanceOf(alexa)).toBigInt()
console.log("Alexa balance before mint:", alexaBalanceBeforeMint)
equal(alexaBalanceBeforeMint, 0n)

console.log("Minting new tokens to Alexa.")
const mintTx = await Mina.transaction({
  sender: operator,
  fee,
}, async () => {
  AccountUpdate.fundNewAccount(operator, 1)
  await token.mint(alexa, new UInt64(2e9))
})
await mintTx.prove()
mintTx.sign([operator.key, adminContractKey.privateKey])
const mintTxResult = await mintTx.send().then((v) => v.wait())
console.log("Mint tx result:", mintTxResult.toPretty())
equal(mintTxResult.status, "included")

const alexaBalanceAfterMint = (await token.getBalanceOf(alexa)).toBigInt()
console.log("Alexa balance after mint:", alexaBalanceAfterMint)
equal(alexaBalanceAfterMint, BigInt(2e9))

const billyBalanceBeforeMint = await token.getBalanceOf(billy)
console.log("Billy balance before mint:", billyBalanceBeforeMint.toBigInt())
equal(alexaBalanceBeforeMint, 0n)

console.log("Transferring tokens from Alexa to Billy")
const transferTx = await Mina.transaction({
  sender: alexa,
  fee,
}, async () => {
  AccountUpdate.fundNewAccount(alexa, 1)
  await token.transfer(alexa, billy, new UInt64(1e9))
})
await transferTx.prove()
transferTx.sign([alexa.key])
const transferTxResult = await transferTx.send().then((v) => v.wait())
console.log("Transfer tx result:", transferTxResult.toPretty())
equal(transferTxResult.status, "included")

const alexaBalanceAfterTransfer = (await token.getBalanceOf(alexa)).toBigInt()
console.log("Alexa balance after transfer:", alexaBalanceAfterTransfer)
equal(alexaBalanceAfterTransfer, BigInt(1e9))

const billyBalanceAfterTransfer = (await token.getBalanceOf(billy)).toBigInt()
console.log("Billy balance after transfer:", billyBalanceAfterTransfer)
equal(billyBalanceAfterTransfer, BigInt(1e9))

console.log("Burning Billy's tokens")
const burnTx = await Mina.transaction({
  sender: billy,
  fee,
}, async () => {
  await token.burn(billy, new UInt64(6e8))
})
await burnTx.prove()
burnTx.sign([billy.key])
const burnTxResult = await burnTx.send().then((v) => v.wait())
console.log("Burn tx result:", burnTxResult.toPretty())
equal(burnTxResult.status, "included")

const billyBalanceAfterBurn = (await token.getBalanceOf(billy)).toBigInt()
console.log("Billy balance after burn:", billyBalanceAfterBurn)
equal(billyBalanceAfterBurn, BigInt(4e8))
