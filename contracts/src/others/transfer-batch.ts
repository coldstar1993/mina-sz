import { AccountUpdate, fetchAccount, Mina, PrivateKey, PublicKey, UInt32 } from 'o1js';
import fs from "fs";

let x = process.env.TEST_ON_BERKELEY === 'true';
// Network configuration
const network = Mina.Network({
    networkId: "mainnet",
    mina: x ? 'https://api.minascan.io/node/devnet/v1/graphql/' : 'https://mina-mainnet-graphql.aurowallet.com/graphql/',
    archive: x ? 'https://api.minascan.io/archive/devnet/v1/graphql/' : 'https://api.minascan.io/archive/mainnet/v1/graphql/'
});
Mina.setActiveInstance(network);

// Fee payer setup
const senderKey = PrivateKey.fromBase58(process.env.SENDER_KEY as string);// 你的私钥
const sender = senderKey.toPublicKey();

console.log(`Fetching the fee payer account information.`);
const senderAcct = await fetchAccount({ publicKey: sender });
if (senderAcct.error && senderAcct.error.statusCode != 404) {
    throw new Error("network issue... pls check your network connection!");
}
const accountDetails = senderAcct.account;
console.log(
    `Using the fee payer account ${sender.toBase58()} with nonce: ${accountDetails?.nonce
    } and balance: ${accountDetails?.balance}.`
);
console.log('');

let nonce = Number(senderAcct.account!.nonce.toString());

const recievers = fs.readFileSync('./src/others/recievers.txt').toString().split('\n').filter(x => x.length != 0).map(x => {
    return { addr: PublicKey.fromBase58(x.split(':')[0]), amount: Number(x.split(':')[1]) * 1e9 }
});

for (let i = 0; i < recievers.length; i++) {
    const r = recievers[i].addr;

    const rAcct = await fetchAccount({ publicKey: r });
    if (rAcct.error && rAcct.error.statusCode != 404) {
        console.error(`network issue when fetchAccount: ${r}, pls check your network connection!`);
        break;
    }

    let tx = await Mina.transaction({
        sender,
        fee: 0.01 * 1e9,
        memo: 'Mina Bootcamp Nov. Reward',
        nonce
    }, async () => {
        if (!rAcct.account) {
            AccountUpdate.fundNewAccount(sender);// 需要为新账户创建而花费1MINA
        }
        const senderAcctUpt = AccountUpdate.createSigned(sender);
        senderAcctUpt.send({ to: r, amount: recievers[i].amount })
    });

    let tx1 = tx.sign([senderKey]);
    await tx1.send();

    nonce++;
    console.log(`${r.toBase58()}'s reward is sent!`);
}

console.log(`all reward is sent!`);


