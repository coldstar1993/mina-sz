import {
  SelfProof,
  Field,
  ZkProgram,
  verify,
  Proof,
  JsonProof,
  Provable,
  Poseidon,
} from 'o1js';


const targetHash0 = Field('7316390958668495944925151659350747554661900395277588947710114819309740684320');// this is provided by verifier
console.log(`targetHash0: ${targetHash0}`);

let MyProgram = ZkProgram({
  name: 'Hash-Preimage-Prover',
  publicInput: Field,

  methods: {
    provePreimage: {
      privateInputs: [Field],
      async method(targetHash: Field, privInput: Field) {
        const hashX = Poseidon.hash([privInput]);
        targetHash.assertEquals(hashX);// constraint
      },
    }
  },
});

// type sanity checks
MyProgram.publicInputType satisfies typeof Field;
MyProgram.publicOutputType satisfies Provable<void>;

let MyProof = ZkProgram.Proof(MyProgram);

console.log('program digest', await MyProgram.digest());

console.log('compiling MyProgram...');
console.time('MyProgram.compile time cost ');
let { verificationKey } = await MyProgram.compile();
console.timeEnd('MyProgram.compile time cost ');
console.log('verification key', verificationKey.data.slice(0, 10) + '..');

console.log('proving...');
console.time('MyProgram.provePreimage time cost ');
const preimage0 = Field(123);// this is kept privately by prover
let proof = await MyProgram.provePreimage(targetHash0, preimage0);
console.timeEnd('MyProgram.provePreimage time cost ');
proof = await testJsonRoundtrip(MyProof, proof);

// type sanity check
proof satisfies Proof<Field, void>;

console.log('verify...');
console.time('verify MyProgram time cost ');
let ok = await verify(proof.toJSON(), verificationKey);
console.timeEnd('verify MyProgram time cost ');
console.log('ok?', ok);

console.log('verify alternative...');
ok = await MyProgram.verify(proof);
console.log('ok (alternative)?', ok);

function testJsonRoundtrip<
  P extends Proof<any, any>,
  MyProof extends { fromJSON(jsonProof: JsonProof): Promise<P> }
>(MyProof: MyProof, proof: P) {
  let jsonProof = proof.toJSON();
  console.log(
    'json proof',
    JSON.stringify({
      ...jsonProof,
      proof: jsonProof.proof.slice(0, 10) + '..',
    })
  );
  return MyProof.fromJSON(jsonProof);
}
