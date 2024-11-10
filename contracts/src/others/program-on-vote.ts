import {
    SelfProof,
    Field,
    ZkProgram,
    Proof,
    Provable,
    Struct,
    PublicKey,
    Bool,
    PrivateKey
} from 'o1js';


/**
 * 注意：下面投票案例基于不存在重复投票的假设。
 */
const MEMBER_CNT = 3;
class VoteState extends Struct({
    teammates: Provable.Array(PublicKey, MEMBER_CNT),
    voteFor: Field,
    voteAgainst: Field
}) {
    static applyVote(
        state: VoteState,
        voteFor: Bool,
        privateKey: PrivateKey
    ) {
        const publicKey = privateKey.toPublicKey();

        // 对于大团队的场景，应该优化：采用merkle tree做成员证明
        let isMember = Bool(false);
        for (let i = 0; i < MEMBER_CNT; i++) {
            isMember = isMember.or(Provable.if(state.teammates[i].equals(publicKey), Bool(true), Bool(false)));
        }
        isMember.assertTrue();

        return new VoteState({
            teammates: state.teammates,
            voteFor: state.voteFor.add(Provable.if(voteFor, Field(1), Field(0))),
            voteAgainst: state.voteAgainst.add(Provable.if(voteFor, Field(0), Field(1)))
        });
    }

    static assertInitialState(state: VoteState) {
        for (let i = 0; i < MEMBER_CNT; i++) {
            const e = state.teammates[i];
            e.equals(PublicKey.empty()).assertFalse();
        }
        state.voteFor.assertEquals(Field(0))
        state.voteAgainst.assertEquals(Field(0))
    }

    static checkSameTeam(state0: VoteState, state1: VoteState) {
        for (let i = 0; i < MEMBER_CNT; i++) {
            state0.teammates[i].assertEquals(state1.teammates[i]);
        }
    }
}

let VoteProgram = ZkProgram({
    name: 'example-with-vote',
    publicInput: VoteState,

    methods: {
        initVoteState: {
            privateInputs: [],
            async method(voteState: VoteState) {
                VoteState.assertInitialState(voteState);
            },
        },

        applyVote: {
            privateInputs: [SelfProof, Bool, PrivateKey],
            async method(voteState: VoteState, earlierProof: SelfProof<VoteState, void>, voteFor: Bool, privKey: PrivateKey) {
                Provable.log(`1) earlierProof.verify`);
                earlierProof.verify();

                Provable.log(`2) check if the same team`);
                VoteState.checkSameTeam(voteState, earlierProof.publicInput);

                Provable.log(`3) accumulate the vote`);

                VoteState.applyVote(voteState, voteFor, privKey);
            },
        },
    },
});

let applyVoteAndProve = async (lastProof: Proof<VoteState, void>, voteFor: Bool, teammateKey: PrivateKey) => {
    let lastVoteState = lastProof.publicInput;
    let voteState = new VoteState({
        teammates: lastVoteState.teammates,
        voteFor: Provable.if(voteFor, lastVoteState.voteFor.add(1), lastVoteState.voteFor),
        voteAgainst: Provable.if(voteFor, lastVoteState.voteAgainst, lastVoteState.voteAgainst.add(1)),
    });
    let proof = await VoteProgram.applyVote(voteState, lastProof, voteFor, teammateKey);

    return proof;
}


await VoteProgram.compile();

const teammate0Key = PrivateKey.random();
const teammate0Addr = teammate0Key.toPublicKey();
const teammate1Key = PrivateKey.random();
const teammate1Addr = teammate1Key.toPublicKey();
const teammate2Key = PrivateKey.random();
const teammate2Addr = teammate2Key.toPublicKey();

const team = [teammate0Addr, teammate1Addr, teammate2Addr];


let voteStateInit = new VoteState({
    teammates: team,
    voteFor: Field(0),
    voteAgainst: Field(0)
});
let proofInit = await VoteProgram.initVoteState(voteStateInit);

console.log(`team0 is voting...`);
const voteFor0 = Bool(true);
const proof0 = await applyVoteAndProve(proofInit, voteFor0, teammate0Key);

console.log(`team1 is voting...`);
const voteFor1 = Bool(false);
const proof1 = await applyVoteAndProve(proof0, voteFor1, teammate1Key);

console.log(`team2 is voting...`);
const voteFor2 = Bool(true);
const proof2 = await applyVoteAndProve(proof1, voteFor2, teammate2Key);

console.log(`total vote stats:
        voteFor counts: ${proof2.publicInput.voteFor},\n
        voteAgainst counts: ${proof2.publicInput.voteAgainst}
    `);
