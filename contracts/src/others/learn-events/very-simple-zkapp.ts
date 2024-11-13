import {
  Field,
  state,
  State,
  method,
  SmartContract,
  DeployArgs,
  Permissions,
  Struct
} from 'o1js';

export class UpdateEvent extends Struct({
  before: Field,
  after: Field
}) {}

let initialState = Field(1);
export class VerySimpleZkapp extends SmartContract {

  @state(Field) x = State<Field>(initialState);

  events = {
    "update": UpdateEvent,
    "input": Field,
  }

  async deploy(props?: DeployArgs) {
    await super.deploy(props)

    // 初始化合约状态
    this.x.set(initialState);

    // 初始化账户权限
    this.account.permissions.set({
      ...Permissions.default(),
      setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
      setPermissions: Permissions.impossible(),
    })
  }

  @method.returns(Field)
  async update(y: Field) {
    // check if has exec init()
    // this.account.provedState.requireEquals(Bool(true));
    // check if timestamp meets
    // this.network.timestamp.requireBetween(beforeGenesis, UInt64.MAXINT());
    
    this.emitEvent("input", y);

    // fetch onchain states
    // let x = this.x.getAndRequireEquals();
    let x = this.x.get();// x = 1
    this.x.requireEquals(x);// 

    let newX = x.add(y);
    this.x.set(newX);// updates

    this.emitEvent("update", new UpdateEvent({before: x, after: newX}));

    return newX;
  }
}
