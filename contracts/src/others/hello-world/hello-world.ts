import {
  Field,
  PrivateKey,
  Provable,
  SmartContract,
  State,
  assert,
  method,
  state,
} from 'o1js';

export const adminPrivateKey = PrivateKey.fromBase58(
  'EKFcef5HKXAn7V2rQntLiXtJr15dkxrsrQ1G4pnYemhMEAWYbkZW'
);
export const adminPublicKey = adminPrivateKey.toPublicKey();

export class HelloWorld extends SmartContract {
  @state(Field) x = State<Field>();

  init() {
    super.init();
    this.x.set(Field(2));
    this.account.delegate.set(adminPublicKey);
  }

  @method async update(squared: Field, admin: PrivateKey) {
    const x = this.x.getAndRequireEquals();// fetch onchain states
    x.square().assertEquals(squared);// assert!

    const adminPk = admin.toPublicKey();
    this.account.delegate.requireEquals(adminPk);// assert!

    this.x.set(squared);// update
  }
}
