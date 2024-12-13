/**
 * This example demonstrates a pattern to use actions for concurrent state updates. 
 */
import {
  Field,
  state,
  State,
  method,
  PrivateKey,
  SmartContract,
  Mina,
  AccountUpdate,
  Bool,
  Struct,
  Reducer,
  Provable,
  UInt32,
  
} from 'o1js';
import assert from 'node:assert/strict';
import { getProfiler } from '../utils/profiler.js';
import fs from "fs";

class MaybeIncrement extends Struct({
  isIncrement: Bool,
  otherData: Field,
}) { }
const INCREMENT = new MaybeIncrement({ isIncrement: Bool(true), otherData: Field(0) });

class Counter extends SmartContract {
  // the "reducer" field describes a type of action that we can dispatch, and reduce later
  reducer = Reducer({ actionType: MaybeIncrement });

  // on-chain version of our state. it will typically lag behind the
  // version that's implicitly represented by the list of actions
  @state(Field) counter = State<Field>();
  // helper field to store the point in the action history that our on-chain state is at
  @state(Field) markedActionState = State<Field>();

  @method async incrementCounter() {
    this.reducer.dispatch(INCREMENT);
  }
  @method async dispatchData(data: Field) {
    this.reducer.dispatch({ isIncrement: Bool(false), otherData: data });
  }

  @method async rollupIncrements() {
    // get previous counter & actions hash, assert that they're the same as on-chain values
    let counter = this.counter.getAndRequireEquals();
    let markedActionState = this.markedActionState.getAndRequireEquals();

    // compute the new counter and hash from pending actions
    let pendingActions = this.reducer.getActions({
      fromActionState: markedActionState,
    });

    let newCounter = this.reducer.reduce( // will construct a precondition(actionState=*) underlyingly!
      pendingActions,
      // state type
      Field,
      // function that says how to apply an action
      (state: Field, action: MaybeIncrement) => {
        return Provable.if(action.isIncrement, state.add(1), state);
      },
      counter,
      { maxUpdatesWithActions: 10 }
    );

    // update on-chain state
    this.counter.set(newCounter);
    this.markedActionState.set(pendingActions.hash);
  }
}

const ReducerProfiler = getProfiler('Reducer zkApp');
ReducerProfiler.start('Reducer zkApp test flow');
const doProofs = true;
const initialCounter = Field(0);

let Local = await Mina.LocalBlockchain({ proofsEnabled: doProofs });
Mina.setActiveInstance(Local);

let [feePayer] = Local.testAccounts;

// the contract account
let contractAccount = Mina.TestPublicKey(
  PrivateKey.fromBase58('EKEQc95PPQZnMY9d9p1vq1MWLeDJKtvKj4V75UDG3rjnf32BerWD')
);
let counterContract = new Counter(contractAccount);
if (doProofs) {
  console.log('compile');
  await Counter.compile();
}

console.log(
  'rows: ',
  (await Counter.analyzeMethods())['rollupIncrements'].rows
);

console.log('deploy');
let tx = await Mina.transaction(feePayer, async () => {
  AccountUpdate.fundNewAccount(feePayer);
  await counterContract.deploy();
  counterContract.counter.set(initialCounter);
  counterContract.markedActionState.set(Reducer.initialActionState);
});
await tx.sign([feePayer.key, contractAccount.key]).send();

let currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('applying actions..');

console.log('\n----action 1----');

tx = await Mina.transaction(feePayer, async () => {
  await counterContract.incrementCounter();
});
await tx.prove();
await tx.sign([feePayer.key]).send();
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action1-tx.json', tx.toJSON());
let rs = await Mina.fetchActions(counterContract.address, );
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action1-fetchActions-result.json', JSON.stringify(rs));

console.log('current block height: ', Local.getNetworkState().blockchainLength.toString());
currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('\n----action 2----');
tx = await Mina.transaction(feePayer, async () => {
  await counterContract.incrementCounter();
});
await tx.prove();
await tx.sign([feePayer.key]).send();
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action2-tx.json', tx.toJSON());
rs = await Mina.fetchActions(counterContract.address, );
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action2-fetchActions-result.json', JSON.stringify(rs));

console.log('current block height: ', Local.getNetworkState().blockchainLength.toString());
currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('\n----action 3----');
tx = await Mina.transaction(feePayer, async () => {
  await counterContract.incrementCounter();
});
await tx.prove();
await tx.sign([feePayer.key]).send();
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action3-tx.json', tx.toJSON());
rs = await Mina.fetchActions(counterContract.address, );
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/action3-fetchActions-result.json', JSON.stringify(rs));

console.log('current block height: ', Local.getNetworkState().blockchainLength.toString());
currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('rolling up pending actions..');

rs = await Mina.fetchActions(counterContract.address, );

console.log('state before: ' + counterContract.counter.get());

tx = await Mina.transaction(feePayer, async () => {
  await counterContract.rollupIncrements();
});
await tx.prove();
await tx.sign([feePayer.key]).send();
fs.writeFileSync('./src/others/learn-actions-reducer/tmp-data/rollupIncrements-tx.json', tx.toJSON());

console.log('state after rollup: ' + counterContract.counter.get());
assert.deepEqual(counterContract.counter.get().toString(), '3');

console.log('applying more actions');

console.log('\n----action 4 (no increment)----');
tx = await Mina.transaction(feePayer, async () => {
  await counterContract.dispatchData(Field.random());
});
await tx.prove();
await tx.sign([feePayer.key]).send();

currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('\n----action 5----');
tx = await Mina.transaction(feePayer, async () => {
  await counterContract.incrementCounter();
});
await tx.prove();
await tx.sign([feePayer.key]).send();

currentActionStates = (await Mina.getAccount(counterContract.address)).zkapp?.actionState;
console.log(`=> counterContract.zkapp.actionState: `, currentActionStates!.map(a => a.toString()));

console.log('rolling up pending actions..');

console.log('state before: ' + counterContract.counter.get());

tx = await Mina.transaction(feePayer, async () => {
  await counterContract.rollupIncrements();
});
await tx.prove();
await tx.sign([feePayer.key]).send();

console.log('state after rollup: ' + counterContract.counter.get());
assert.equal(counterContract.counter.get().toString(), '4');
ReducerProfiler.stop().store();
