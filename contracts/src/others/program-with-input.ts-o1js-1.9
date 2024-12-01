import {
  SelfProof,
  Field,
  ZkProgram,
  verify,
  Proof,
  JsonProof,
  Provable,
} from 'o1js';


/**
 * 加法累加：证明指定计算结果是从0开始逐1累加的。
 */
let MyProgram = ZkProgram({
  name: 'example-with-input',
  publicInput: Field,
  //publicOutput: Field,

  methods: {
    baseCase: {
      privateInputs: [],
      async method(input: Field) {
        input.assertEquals(Field(0));// constraint
      },
    },

    inductiveCase: {
      privateInputs: [SelfProof],
      async method(input: Field, earlierProof: SelfProof<Field, void>) {
        Provable.log(`1) earlierProof.verify`);
        earlierProof.verify();
        Provable.log(`2) earlierProof.publicInput.add`);
        earlierProof.publicInput.add(1).assertEquals(input);
      },
    },
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

console.log('proving base case...');
console.time('MyProgram.baseCase time cost ');
let input = Field(0);
let proof = await MyProgram.baseCase(input);
console.timeEnd('MyProgram.baseCase time cost ');
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

console.log('proving step 1...');
console.time('MyProgram.inductiveCase time cost ');
input = input.add(1);
proof = await MyProgram.inductiveCase(input, proof);
console.timeEnd('MyProgram.inductiveCase time cost ');
proof = await testJsonRoundtrip(MyProof, proof);

console.log('verify...');
ok = await verify(proof, verificationKey);
console.log('ok?', ok);

console.log('verify alternative...');
ok = await MyProgram.verify(proof);
console.log('ok (alternative)?', ok);

console.log('proving step 2...');
input = input.add(1);
proof = await MyProgram.inductiveCase(input, proof);
proof = await testJsonRoundtrip(MyProof, proof);

console.log('verify...');
ok = await verify(proof.toJSON(), verificationKey);

console.log('ok?', ok && proof.publicInput.toString() === '2');

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
