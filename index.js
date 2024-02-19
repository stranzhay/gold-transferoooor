import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { IDL as SoulBoundIdl } from "./_idls/soulBoundAuthority.js";
import { IDL as CardinalStakePoolIdl } from "./_idls/cardinalStakePool.js";
import { IDL as CardinalRewardDistributorIdl } from "./_idls/cardinalRewardDistributor.js";
import { Metaplex } from "@metaplex-foundation/js";
import BN from "bn.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

function loadKeypair(keypairPath) {
  return Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, "utf-8")))
  );
}

const SOUL_BOUND_PROGRAM_ID = new PublicKey(
  "7DkjPwuKxvz6Viiawtbmb4CqnMKP6eGb1WqYas1airUS"
);
const CARDINAL_REWARD_DISTRIBUTOR_PROGRAM_ID = new PublicKey(
  "H2yQahQ7eQH8HXXPtJSJn8MURRFEWVesTd8PsracXp1S"
);
const CARDINAL_STAKE_POOL_PROGRAM_ID = new PublicKey(
  "2gvBmibwtBnbkLExmgsijKy6hGXJneou8X6hkyWQvYnF"
);

const GOLD_MINT = new PublicKey("5QPAPkBvd2B7RQ6DBGvCxGdAcyWitdvRAP58CdvBiuf7");
const REWARD_DISTRIBUTOR = new PublicKey(
  "6DBnpqRm1szSz25dD1aWEmYzgGoMB59Y1GMv2gtWUSM4"
);

const STAKE_POOL = new PublicKey(
  "7xmGGtuNNvjKLDwbYWBYGPpAjRqftJnrTyzSRK92yku8"
);

async function main() {
  const connection = new Connection("");

  const wallet = new anchor.Wallet(loadKeypair(""));
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });

  anchor.setProvider(provider);

  const SOUL_BOUND_PROGRAM = new Program(
    SoulBoundIdl,
    SOUL_BOUND_PROGRAM_ID,
    provider
  );
  const REWARD_DISTRIBUTOR_PROGRAM = new Program(
    CardinalRewardDistributorIdl,
    CARDINAL_REWARD_DISTRIBUTOR_PROGRAM_ID,
    provider
  );
  const STAKE_POOL_PROGRAM = new Program(
    CardinalStakePoolIdl,
    CARDINAL_STAKE_POOL_PROGRAM_ID,
    provider
  );

  const metaplex = new Metaplex(connection);

  const fromNft = await metaplex.nfts().findByMint({
    mintAddress: new PublicKey(""),
  });

  const toNft = await metaplex.nfts().findByMint({
    mintAddress: new PublicKey(""),
  });

  const ixs = await claimRewardInstruction({
    user: wallet.publicKey,
    nft: fromNft,
    stakePool: STAKE_POOL,
    rewardDistributor: REWARD_DISTRIBUTOR,
    goldMint: GOLD_MINT,
    soulboundProgram: SOUL_BOUND_PROGRAM,
    stakePoolProgram: STAKE_POOL_PROGRAM,
    rewardDistributorProgram: REWARD_DISTRIBUTOR_PROGRAM,
  });

  const amount = new BN(); // however much u want here
  await transferRewards({
    amount,
    fromUser: new PublicKey(""),
    fromNft: {
      mintAddress: fromNft.address,
      metadataAddress: fromNft.metadataAddress,
    },
    toNft: {
      mintAddress: toNft.mint.address,
      metadataAddress: toNft.metadataAddress,
    },
    goldMint: GOLD_MINT,
    stakePool: STAKE_POOL,
    rewardDistributor: REWARD_DISTRIBUTOR,
    soulboundProgram: SOUL_BOUND_PROGRAM,
    stakePoolProgram: STAKE_POOL_PROGRAM,
    rewardDistributorProgram: REWARD_DISTRIBUTOR_PROGRAM,
    provider,
  });
}

main().catch(console.error);

async function transferRewards({
  amount,
  fromUser, // fromUser should be the client payer/signer.
  fromNft,
  toNft,
  goldMint = GOLD_MINT,
  stakePool = STAKE_POOL,
  rewardDistributor = REWARD_DISTRIBUTOR,
  soulboundProgram = SOUL_BOUND_PROGRAM,
  stakePoolProgram = STAKE_POOL_PROGRAM,
  rewardDistributorProgram = REWARD_DISTRIBUTOR_PROGRAM,
  provider,
}) {
  const toUser = fromUser; // Transfers only allowed between same wallet.
  const [fromSbaUser] = PublicKey.findProgramAddressSync(
    [Buffer.from("sba-scoped-user"), fromUser.toBuffer()],
    soulboundProgram.programId
  );

  const fromScopedSbaUserAuthority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sba-scoped-user-nft-program"),
      fromUser.toBuffer(),
      fromNft.mintAddress.toBuffer(),
      rewardDistributorProgram.programId.toBuffer(),
    ],
    soulboundProgram.programId
  )[0];
  const fromStakeEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake-entry"),
      stakePool.toBuffer(),
      fromNft.mintAddress.toBuffer(),
      getStakeSeed(1, fromUser).toBuffer(),
    ],
    stakePoolProgram.programId
  )[0];
  const fromRewardEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("reward-entry"),
      rewardDistributor.toBuffer(),
      fromStakeEntry.toBuffer(),
    ],
    rewardDistributorProgram.programId
  )[0];
  const fromScopedSbaUserAuthorityAta = await getAssociatedTokenAddress(
    goldMint,
    fromScopedSbaUserAuthority,
    true
  );

  const toScopedSbaUserAuthority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sba-scoped-user-nft-program"),
      toUser.toBuffer(),
      toNft.mintAddress.toBuffer(),
      rewardDistributorProgram.programId.toBuffer(),
    ],
    soulboundProgram.programId
  )[0];
  const toStakeEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake-entry"),
      stakePool.toBuffer(),
      toNft.mintAddress.toBuffer(),
      getStakeSeed(1, toUser).toBuffer(),
    ],
    stakePoolProgram.programId
  )[0];
  const toRewardEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("reward-entry"),
      rewardDistributor.toBuffer(),
      toStakeEntry.toBuffer(),
    ],
    rewardDistributorProgram.programId
  )[0];
  const toScopedSbaUserAuthorityAta = await getAssociatedTokenAddress(
    goldMint,
    toScopedSbaUserAuthority,
    true
  );

  const fromNftToken = await getAssociatedTokenAddress(
    fromNft.mintAddress,
    fromUser
  );

  let { data, keys } = await rewardDistributorProgram.methods
    .transferRewards(amount ?? null)
    .accounts({
      rewardEntryA: fromRewardEntry,
      rewardEntryB: toRewardEntry,
      stakeEntryA: fromStakeEntry,
      stakeEntryB: toStakeEntry,
      rewardDistributor,
      stakePool,
      originalMintA: fromNft.mintAddress,
      originalMintB: toNft.mintAddress,
      rewardMint: goldMint,
      user: fromUser,
      userRewardMintTokenAccountA: fromScopedSbaUserAuthorityAta,
      userRewardMintTokenAccountB: toScopedSbaUserAuthorityAta,
      authorityA: fromScopedSbaUserAuthority,
      authorityB: toScopedSbaUserAuthority,
    })
    .instruction();

  // Need to set the signer on the PDA to false so that we can serialize
  // the transaction without error. The CPI in the program will flip this
  // back to true before signging with PDA seeds.
  keys = keys.map((k) => {
    return {
      ...k,
      isSigner: k.pubkey.equals(fromScopedSbaUserAuthority)
        ? false
        : k.isSigner,
    };
  });

  const tx = await soulboundProgram.methods
    .executeTxScopedUserNftProgram(data)
    .accounts({
      sbaUser: fromSbaUser,
      nftToken: fromNftToken,
      nftMint: fromNft.mintAddress,
      authority: fromUser,
      delegate: PublicKey.default, // None.
      authorityOrDelegate: fromUser,
      scopedAuthority: fromScopedSbaUserAuthority,
      program: rewardDistributorProgram.programId,
    })
    .remainingAccounts(keys)
    .transaction();

  // @ts-ignore
  return await provider.sendAndConfirm(tx);
}

// Supply is the token supply of the nft mint.
function getStakeSeed(supply, user) {
  if (supply > 1) {
    return user;
  } else {
    return PublicKey.default;
  }
}

async function claimRewardInstruction({
  user,
  nft,
  stakePool = STAKE_POOL,
  rewardDistributor = REWARD_DISTRIBUTOR,
  goldMint = GOLD_MINT,
  soulboundProgram = SOUL_BOUND_PROGRAM,
  stakePoolProgram = STAKE_POOL_PROGRAM,
  rewardDistributorProgram = REWARD_DISTRIBUTOR_PROGRAM,
}) {
  const [sbaUser] = PublicKey.findProgramAddressSync(
    [Buffer.from("sba-scoped-user"), user.toBuffer()],
    soulboundProgram.programId
  );
  const scopedSbaUserAuthority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sba-scoped-user-nft-program"),
      user.toBuffer(),
      nft.address.toBuffer(),
      rewardDistributorProgram.programId.toBuffer(),
    ],
    soulboundProgram.programId
  )[0];
  const stakeEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("stake-entry"),
      stakePool.toBuffer(),
      nft.address.toBuffer(),
      getStakeSeed(1, user).toBuffer(),
    ],
    stakePoolProgram.programId
  )[0];
  const rewardEntry = PublicKey.findProgramAddressSync(
    [
      Buffer.from("reward-entry"),
      rewardDistributor.toBuffer(),
      stakeEntry.toBuffer(),
    ],
    rewardDistributorProgram.programId
  )[0];
  const userRewardMintTokenAccount = await getAssociatedTokenAddress(
    goldMint,
    scopedSbaUserAuthority,
    true
  );
  let { data, keys } = await rewardDistributorProgram.methods
    .claimRewards()
    .accounts({
      rewardEntry,
      rewardDistributor,
      stakeEntry,
      stakePool,
      originalMint: nft.address,
      rewardMint: goldMint,
      userRewardMintTokenAccount,
      authority: scopedSbaUserAuthority,
      user,
    })
    .instruction();

  // Need to set the signer on the PDA to false so that we can serialize
  // the transaction without error. The CPI in the program will flip this
  // back to true before signging with PDA seeds.
  keys = keys.map((k) => {
    return {
      ...k,
      isSigner: k.pubkey.equals(scopedSbaUserAuthority) ? false : k.isSigner,
    };
  });

  const nftToken = await getAssociatedTokenAddress(nft.address, user);

  //
  // If this is the first time using the soulbound program, then we need
  // to initialize the user account.
  //
  const soulboundInitInstructions = await (async () => {
    // If the soul bound authority user is already created, do nothing.
    if (await isSoulBoundAuthorityUserInitialized(user, soulboundProgram)) {
      return [];
    }
    // If the soulbound authority user is not yet created, then we
    // need to create it before claiming a reward.
    else {
      __cached = null; // Wipe cache.
      return [
        await soulboundProgram.methods
          .createSbaUser()
          .accounts({
            sba: sbaUser,
            authority: user,
            payer: user,
          })
          // .instruction(),
          .rpc(),
      ];
    }
  })();

  const updateIx = await stakePoolProgram.methods
    .updateTotalStakeSeconds()
    .accounts({
      stakeEntry,
      lastStaker: user,
    })
    // .instruction();
    .rpc();

  const claimIx = await soulboundProgram.methods
    .executeTxScopedUserNftProgram(data)
    .accounts({
      sbaUser,
      nftToken,
      nftMint: nft.address,
      authority: user,
      delegate: PublicKey.default, // None.
      authorityOrDelegate: user,
      scopedAuthority: scopedSbaUserAuthority,
      program: rewardDistributorProgram.programId,
    })
    .remainingAccounts(keys)
    .rpc();
  // .instruction();

  return soulboundInitInstructions.concat([updateIx, claimIx]);
}

let __cached = null;
async function isSoulBoundAuthorityUserInitialized(
  user,
  soulboundProgram = SOUL_BOUND_PROGRAM
) {
  const [sbaUser] = PublicKey.findProgramAddressSync(
    [Buffer.from("sba-scoped-user"), user.toBuffer()],
    soulboundProgram.programId
  );
  if (__cached !== null) {
    return __cached;
  }
  try {
    await soulboundProgram.account.soulBoundAuthorityUser.fetch(sbaUser);
    __cached = true;
    return true;
  } catch {
    __cached = false;
    return false;
  }
}
