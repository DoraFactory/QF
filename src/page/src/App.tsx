/* eslint-disable import/no-anonymous-default-export */
import "./App.css";
import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Account,
} from "@solana/web3.js";
import React, { useState } from "react";
import bs58 from 'bs58'

// @ts-ignore
import BN from "bn.js";
// @ts-ignore
// import Wallet from "@project-serum/sol-wallet-adapter";
// @ts-ignore
import * as BufferLayout from "buffer-layout";
import * as SPLToken from "@solana/spl-token";

const MINT = SPLToken.NATIVE_MINT
export default () => {
  const programId = new PublicKey(
    "Ft2m4YT7MHJwM3LLTj19NnVMCSPJ2XBngkRsHdRWfMUb" // FIXME: you need to deploy your own program and fill it
  );

  const [connection] = useState(
    // () => new Connection("https://aged-intensive-bird.solana-mainnet.quiknode.pro/e7b510fe077d260826894f431fcb9e708d0b1e8c/")
    () => new Connection("https://api.mainnet-beta.solana.com")
  );
  const [connected, setConnected] = useState(false)
  // const [wallet] = useState(
  //   () => new Wallet("https://www.sollet.io")
  // );
  const [pubkey, setPubkey] = useState(PublicKey.default);

  const [registerProjectRoundPubkey, setRegisterProjectRoundPubkey] = useState(
    ""
  );
  const [voteProjectPubkey, setVoteProjectPubkey] = useState("");
  const [voteAmount, setVoteAmount] = useState("");
  const [initVoterProjectPubkey, setInitVoterProjectPubkey] = useState("");
  const [withdrawProjectPubkey, setWithdrawProjectPubkey] = useState("");
  const [withdrawToPubkey, setWithdrawToPubkey] = useState("");
  const [donateRoundPubkey, setDonateRoundPubkey] = useState("");
  const [donateAmount, setDonateAmount] = useState("");
  const [closeRoundPubkey, setCloseRoundPubkey] = useState("");
  const [withdrawFeeRoundPubkey, setWithdrawFeeRoundPubkey] = useState("");
  const [withdrawFeeToPubkey, setWithdrawFeeToPubkey] = useState("");
  const [banAmount, setBanAmount] = useState("");
  const [banProjectPubkey, setBanProjectPubkey] = useState("");
  const [testPubkey, setTestPubkey] = useState("");
  const [output, setOutput] = useState("");

  const RoundAccountDataLayout = BufferLayout.struct([
    BufferLayout.u8("roundStatus"),
    BufferLayout.u8("ratio"),
    BufferLayout.blob(8, "fund"),
    BufferLayout.blob(8, "fee"),
    BufferLayout.blob(8, "project_number"),
    BufferLayout.blob(32, "vault"),
    BufferLayout.blob(32, "owner"),
    BufferLayout.blob(32, "area"),
    BufferLayout.blob(32, "total_area"),
    BufferLayout.blob(32, "top_area"),
    BufferLayout.blob(32, "min_area"),
    BufferLayout.blob(32, "min_area_p"),
  ]);
  const [getRoundInfoPubkey, setGetRoundInfoPubkey] = useState("");

  const ProjectAccountDataLayout = BufferLayout.struct([
    BufferLayout.blob(32, "round"),
    BufferLayout.blob(32, "owner"),
    BufferLayout.u8("withdraw"),
    BufferLayout.blob(8, "votes"),
    BufferLayout.blob(32, "area"),
    BufferLayout.blob(32, "area_sqrt"),
  ]);
  const [getProjectInfoPubkey, setGetProjectInfoPubkey] = useState("");

  const VoterAccountDataLayout = BufferLayout.struct([
    BufferLayout.u8("isInit"),
    BufferLayout.blob(8, "votes"),
    BufferLayout.blob(8, "votes_sqrt"),
  ]);
  const [getVoterInfoPubkey, setGetVoterInfoPubkey] = useState("");

  function appendOutput(output: String) {
    setOutput((prev) => output + "\n" + prev);
  }

  const slope = new window.Slope()

  const signTransaction = async (tx: Transaction) => {
    await slope.connect()
    const message = bs58.encode(tx.serializeMessage())
    const { data } = await slope.signTransaction(message)

    if (!data.publicKey || !data.signature) return tx

    const publicKey = new PublicKey(data.publicKey)
    const signature = bs58.decode(data.signature)

    tx.addSignature(publicKey, Buffer.from(signature))
    return tx
  }

  async function connectWallet() {
    try {
      // if (wallet.connected) {
      //   return;
      // }
      // wallet.on("connect", (publicKey: PublicKey) => {
      //   console.log("Connected to " + publicKey.toBase58());
      //   setPubkey(publicKey);
      // });
      // wallet.on("disconnect", () => {
      //   console.log("Disconnected");
      //   setPubkey(PublicKey.default);
      // });

      // await wallet.connect();
      const res = await slope.connect()
      setPubkey(new PublicKey(res.data.publicKey))
      setConnected(true)
    } catch (e: any) {
      appendOutput("connect wallet error:" + e.message);
    }
  }

  async function newRound() {
    try {
      let vault = new Account();
      let vaultOwnerPubkey = await getVaultOwnerPubkey(
        pubkey,
        programId
      );
      let round = new Account();
      const tx = new Transaction()
        .add(
          SystemProgram.createAccount({
            fromPubkey: pubkey,
            newAccountPubkey: round.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
              RoundAccountDataLayout.span
            ),
            space: RoundAccountDataLayout.span,
            programId: programId,
          })
        )
        .add(
          SystemProgram.createAccount({
            fromPubkey: pubkey,
            newAccountPubkey: vault.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
              SPLToken.AccountLayout.span
            ),
            space: SPLToken.AccountLayout.span,
            programId: SPLToken.TOKEN_PROGRAM_ID,
          })
        )
        .add(
          SPLToken.Token.createInitAccountInstruction(
            SPLToken.TOKEN_PROGRAM_ID,
            // SPLToken.NATIVE_MINT,
            MINT,
            vault.publicKey,
            vaultOwnerPubkey
          )
        )
        .add(
          createStartRoundInstruction(
            programId,
            round.publicKey,
            pubkey,
            vault.publicKey
          )
        );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      signedTx.partialSign(round, vault);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for New Round");
      await connection.confirmTransaction(txid);
      appendOutput("new round pubkey: " + round.publicKey.toBase58());
    } catch (e: any) {
      appendOutput("new round error:" + e.message);
    }
  }

  async function registerProject(roundPubkey: string) {
    try {
      let round = new PublicKey(roundPubkey);
      let project = new Account();

      const tx = new Transaction()
        .add(
          SystemProgram.createAccount({
            fromPubkey: pubkey,
            newAccountPubkey: project.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
              ProjectAccountDataLayout.span
            ),
            space: ProjectAccountDataLayout.span,
            programId: programId,
          })
        )
        .add(
          registerProjectInstruction(
            programId,
            project.publicKey,
            round,
            pubkey
          )
        );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;
      let signedTx = await signTransaction(tx);
      signedTx.partialSign(project);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for register project");
      await connection.confirmTransaction(txid);
      appendOutput("project pubkey: " + project.publicKey.toBase58());
    } catch (e: any) {
      appendOutput("register project error:" + e.message);
    }
  }

  async function donate(roundPubkey: string, amount: number) {
    try {
      let roundInfo = await getRoundInfo(roundPubkey);
      let round = new PublicKey(roundPubkey);
      let tmpTokenAccount = new Account();

      const tx = new Transaction()
        .add(
          SystemProgram.createAccount({
            fromPubkey: pubkey,
            newAccountPubkey: tmpTokenAccount.publicKey,
            lamports:
              (await connection.getMinimumBalanceForRentExemption(
                SPLToken.AccountLayout.span
              )) + amount,
            space: SPLToken.AccountLayout.span,
            programId: SPLToken.TOKEN_PROGRAM_ID,
          })
        )
        .add(
          SPLToken.Token.createInitAccountInstruction(
            SPLToken.TOKEN_PROGRAM_ID,
            SPLToken.NATIVE_MINT,
            tmpTokenAccount.publicKey,
            pubkey
          )
        )
        .add(
          donateInstruction(
            programId,
            round,
            tmpTokenAccount.publicKey,
            SPLToken.NATIVE_MINT,
            roundInfo.vault,
            pubkey,
            amount,
            9
          )
        )
        .add(
          SPLToken.Token.createCloseAccountInstruction(
            SPLToken.TOKEN_PROGRAM_ID,
            tmpTokenAccount.publicKey,
            pubkey,
            pubkey,
            []
          )
        );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      signedTx.partialSign(tmpTokenAccount);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for donate");
      await connection.confirmTransaction(txid);
      appendOutput("donate success");
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function initVoter(projectPubkey: string) {
    try {
      let assoAccount = await SPLToken.Token.getAssociatedTokenAddress(
        SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        SPLToken.TOKEN_PROGRAM_ID,
        SPLToken.NATIVE_MINT,
        pubkey
      );
      let voterPubkey = await getVoterPubkey(
        new PublicKey(projectPubkey),
        assoAccount,
        programId
      );
      console.log(voterPubkey.toBase58())
      let voterInfo = await getVoterInfo(voterPubkey.toBase58());
      if (voterInfo !== undefined && voterInfo.isInit) {
        appendOutput("voter: " + voterPubkey.toBase58() + " already init");
        return;
      }

      const tx = new Transaction().add(
        initVoterInstruction(
          programId,
          voterPubkey,
          assoAccount,
          new PublicKey(projectPubkey),
          pubkey
        )
      );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for init voter");
      await connection.confirmTransaction(txid);
      appendOutput("voter " + voterPubkey.toBase58() + " init success");
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function vote(projectPubkey: string, amount: number) {
    try {
      let assoAccount = await SPLToken.Token.getAssociatedTokenAddress(
        SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        SPLToken.TOKEN_PROGRAM_ID,
        SPLToken.NATIVE_MINT,
        pubkey
      );
      let voterPubkey = await getVoterPubkey(
        new PublicKey(projectPubkey),
        assoAccount,
        programId
      );
      let voterInfo = await getVoterInfo(voterPubkey.toBase58());
      if (voterInfo === undefined || !voterInfo.isInit) {
        appendOutput(
          "please init voter for project " +
            projectPubkey +
            " first" +
            "\n" +
            output
        );
        return;
      }

      const tx = new Transaction();
      let projectInfo = await getProjectInfo(projectPubkey);
      let roundInfo = await getRoundInfo(projectInfo.round.toBase58());
      let tmpTokenAccount;
      try {
        let accountInfo = await new SPLToken.Token(
          connection,
          SPLToken.NATIVE_MINT,
          SPLToken.TOKEN_PROGRAM_ID,
          pubkey as any
        ).getAccountInfo(assoAccount);
        if (accountInfo.amount < new BN(amount)) {
          tmpTokenAccount = new Account();
          tx.add(
            SystemProgram.createAccount({
              fromPubkey: pubkey,
              newAccountPubkey: tmpTokenAccount.publicKey,
              lamports:
                (await SPLToken.Token.getMinBalanceRentForExemptAccount(
                  connection
                )) + amount,
              space: SPLToken.AccountLayout.span,
              programId: SPLToken.TOKEN_PROGRAM_ID,
            })
          )
            .add(
              SPLToken.Token.createInitAccountInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                SPLToken.NATIVE_MINT,
                tmpTokenAccount.publicKey,
                pubkey
              )
            )
            .add(
              SPLToken.Token.createTransferInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                tmpTokenAccount.publicKey,
                assoAccount,
                pubkey,
                [],
                amount
              )
            )
            .add(
              SPLToken.Token.createCloseAccountInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                tmpTokenAccount.publicKey,
                pubkey,
                pubkey,
                []
              )
            );
        }
      } catch (e: any) {
        if (e.message === "Failed to find account") {
          tmpTokenAccount = new Account();
          tx.add(
            SPLToken.Token.createAssociatedTokenAccountInstruction(
              SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
              SPLToken.TOKEN_PROGRAM_ID,
              SPLToken.NATIVE_MINT,
              assoAccount,
              pubkey,
              pubkey
            )
          )
            .add(
              SystemProgram.createAccount({
                fromPubkey: pubkey,
                newAccountPubkey: tmpTokenAccount.publicKey,
                lamports:
                  (await SPLToken.Token.getMinBalanceRentForExemptAccount(
                    connection
                  )) + amount,
                space: SPLToken.AccountLayout.span,
                programId: SPLToken.TOKEN_PROGRAM_ID,
              })
            )
            .add(
              SPLToken.Token.createInitAccountInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                SPLToken.NATIVE_MINT,
                tmpTokenAccount.publicKey,
                pubkey
              )
            )
            .add(
              SPLToken.Token.createTransferInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                tmpTokenAccount.publicKey,
                assoAccount,
                pubkey,
                [],
                amount
              )
            )
            .add(
              SPLToken.Token.createCloseAccountInstruction(
                SPLToken.TOKEN_PROGRAM_ID,
                tmpTokenAccount.publicKey,
                pubkey,
                pubkey,
                []
              )
            );
        } else {
          appendOutput(e.message + " " + assoAccount.toBase58());
          return;
        }
      }

      tx.add(
        voteInstruction(
          programId,
          projectInfo.round,
          new PublicKey(projectPubkey),
          voterPubkey,
          assoAccount,
          SPLToken.NATIVE_MINT,
          roundInfo.vault,
          pubkey,
          amount,
          9
        )
      );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;
      let signedTx;
      if (tmpTokenAccount !== undefined) {
        signedTx = await tx.partialSign(tmpTokenAccount);
      }
      signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());
      appendOutput("wait for vote");
      await connection.confirmTransaction(txid);
      appendOutput("vote success");
    } catch (e: any) {
      appendOutput("vote error: " + e.message);
    }
  }

  async function withdraw(projectPubkey: string, toPubkey: string) {
    try {
      let projectInfo = await getProjectInfo(projectPubkey);
      let roundInfo = await getRoundInfo(projectInfo.round.toBase58());
      let vaultOwner = await getVaultOwnerPubkey(roundInfo.owner, programId);
      const tx = new Transaction().add(
        withdrawInstruction(
          programId,
          projectInfo.round,
          roundInfo.vault,
          vaultOwner,
          new PublicKey(projectPubkey),
          pubkey,
          new PublicKey(toPubkey)
        )
      );
      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for withdraw");
      await connection.confirmTransaction(txid);
      appendOutput("widraw success");
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function endRound(roundPubkey: string) {
    try {
      let round = new PublicKey(roundPubkey);
      const tx = new Transaction().add(
        endRoundInstruction(programId, round, pubkey)
      );
      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());
      appendOutput("wait for end round");
      await connection.confirmTransaction(txid);
      appendOutput("end round " + roundPubkey + " success");
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function withdrawFee(roundPubkey: string, toPubkey: string) {
    try {
      let roundInfo = await getRoundInfo(roundPubkey);
      let vaultOwner = await getVaultOwnerPubkey(roundInfo.owner, programId);
      const tx = new Transaction().add(
        withdrawFeeInstruction(
          programId,
          new PublicKey(roundPubkey),
          roundInfo.owner,
          roundInfo.vault,
          vaultOwner,
          new PublicKey(toPubkey)
        )
      );
      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;

      let signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());

      appendOutput("wait for withdraw fee");
      await connection.confirmTransaction(txid);
      appendOutput("withdraw fee success");
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function banProject(projectPubkey: string, amount: string) {
    try {
      const tx = new Transaction();
      let projectInfo = await getProjectInfo(projectPubkey);

      tx.add(
        banProjectInstruction(
          programId,
          projectInfo.round,
          pubkey,
          new PublicKey(projectPubkey),
          amount,
        )
      );

      let { blockhash } = await connection.getRecentBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = pubkey;
      let signedTx;
      signedTx = await signTransaction(tx);
      let txid = await connection.sendRawTransaction(signedTx.serialize());
      appendOutput("wait for ban project");
      await connection.confirmTransaction(txid);
      appendOutput("ban project success");
    } catch (e: any) {
      appendOutput("ban project error: " + e.message);
    }
  }


  async function getRoundInfo(roundPubkey: string) {
    try {
      const info = await connection.getAccountInfo(new PublicKey(roundPubkey));
      if (info === null) {
        console.log("Not a valid round info account");
        return;
      }
      const data = Buffer.from(info.data);
      const encodeInfo = RoundAccountDataLayout.decode(data);
      encodeInfo.fund = new BN(encodeInfo.fund, 10, "le");
      encodeInfo.fee = new BN(encodeInfo.fee, 10, "le");
      encodeInfo.vault = new PublicKey(encodeInfo.vault);
      encodeInfo.owner = new PublicKey(encodeInfo.owner);
      encodeInfo.area = new BN(encodeInfo.area, 10, "le");
      encodeInfo.project_number = new BN(encodeInfo.project_number, 10, "le");

      encodeInfo.total_area = new BN(encodeInfo.total_area, 10, "le");
      encodeInfo.top_area = new BN(encodeInfo.top_area, 10, "le");
      encodeInfo.min_area = new BN(encodeInfo.min_area, 10, "le");

      appendOutput(`
      ================ Round ================\n
      status: ${encodeInfo.roundStatus}\n
      ratio: ${encodeInfo.ratio}\n
      owner: ${encodeInfo.owner.toBase58()}\n
      vault: ${encodeInfo.vault.toBase58()}\n
      fund: ${encodeInfo.fund.toString()}\n
      fee: ${encodeInfo.fee.toString()}\n
      area: ${encodeInfo.area.toString()}\n
      projecrs: ${encodeInfo.project_number.toString()}\n
  
      total_area: ${encodeInfo.total_area.toString()}\n
      top_area: ${encodeInfo.top_area.toString()}\n
      min_area: ${encodeInfo.min_area.toString()}
      `);

      return encodeInfo;
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function getProjectInfo(projectPubkey: string) {
    try {
      const info = await connection.getAccountInfo(
        new PublicKey(projectPubkey)
      );
      if (info === null) {
        console.log("Not a valid project info account");
        return;
      }
      const data = Buffer.from(info.data);
      const encodeInfo = ProjectAccountDataLayout.decode(data);
      encodeInfo.round = new PublicKey(encodeInfo.round);
      encodeInfo.owner = new PublicKey(encodeInfo.owner);
      encodeInfo.withdraw = encodeInfo.withdraw === 1;
      encodeInfo.votes = new BN(encodeInfo.votes, 10, "le");
      encodeInfo.area = new BN(encodeInfo.area, 10, "le");
      encodeInfo.area_sqrt = new BN(encodeInfo.area_sqrt, 10, "le");

      appendOutput(`
      ================ Project ================\n
      round: ${encodeInfo.round.toBase58()}\n
      owner: ${encodeInfo.owner.toBase58()}\n
      withdraw: ${encodeInfo.withdraw}\n
      votes: ${encodeInfo.votes.toString()}\n
      area: ${encodeInfo.area.toString()}\n
      area_sqrt: ${encodeInfo.area_sqrt.toString()}`);

      return encodeInfo;
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function getVoterInfo(voterPubkey: string) {
    try {
      const info = await connection.getAccountInfo(new PublicKey(voterPubkey));
      if (info === null) {
        return;
      }
      const data = Buffer.from(info.data);
      const encodeInfo = VoterAccountDataLayout.decode(data);
      encodeInfo.isInit = encodeInfo.isInit === 1;
      encodeInfo.votes = new BN(encodeInfo.votes, 10, "le");
      encodeInfo.votes_sqrt = new BN(encodeInfo.votes_sqrt, 10, "le");

      appendOutput(`
      ================ Voter ================\n
      isInit: ${encodeInfo.isInit}\n
      votes: ${encodeInfo.votes.toString()}\n
      votes sqrt: ${encodeInfo.votes_sqrt.toString()}`);
      return encodeInfo;
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  async function test(publicKey: string) {
    try {
      let assoAccount = await SPLToken.Token.getAssociatedTokenAddress(
        SPLToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        SPLToken.TOKEN_PROGRAM_ID,
        MINT,
        new PublicKey(publicKey),
      );
      let accountInfo = await connection.getTokenAccountsByOwner(new PublicKey(publicKey), {
        mint: MINT,
      })
      
      console.log(accountInfo.value[0].pubkey.toBase58())

      appendOutput(assoAccount.toBase58())
    } catch (e: any) {
      appendOutput(e.message);
    }
  }

  return (
    <div>
      <div>
        <h1>Connect Wallet</h1>
      </div>
      <button onClick={() => connectWallet()}>
        {connected
          ? "connect to:" + pubkey.toBase58()
          : "connect wallet"}
      </button>
      <div>
        <h1>Instruction</h1>
      </div>
      {connected ? (
        <div>
          <div>
            <button onClick={() => newRound()}>New Round</button>
          </div>
          <div>
            <input
              type="text"
              value={donateRoundPubkey}
              onChange={(v) => setDonateRoundPubkey(v.target.value)}
              placeholder="round pubkey (base58)"
            ></input>
            <input
              type="text"
              pattern="[0-9]*"
              value={donateAmount}
              onChange={(v) => setDonateAmount(v.target.value)}
              placeholder="amount"
            ></input>
            <button
              onClick={() => donate(donateRoundPubkey, parseInt(donateAmount))}
            >
              Donate
            </button>
          </div>
          <div>
            <input
              type="text"
              value={registerProjectRoundPubkey}
              onChange={(v) => setRegisterProjectRoundPubkey(v.target.value)}
              placeholder="round pubkey (base58)"
            ></input>
            <button onClick={() => registerProject(registerProjectRoundPubkey)}>
              Register New Project
            </button>
          </div>
          <div>
            <input
              type="text"
              value={initVoterProjectPubkey}
              onChange={(v) => setInitVoterProjectPubkey(v.target.value)}
              placeholder="project pubkey (base58)"
            ></input>
            <button onClick={() => initVoter(initVoterProjectPubkey)}>
              Init Voter
            </button>
          </div>
          <div>
            <input
              type="text"
              value={voteProjectPubkey}
              onChange={(v) => setVoteProjectPubkey(v.target.value)}
              placeholder="project pubkey (base58)"
            ></input>
            <input
              type="text"
              pattern="[0-9]*"
              value={voteAmount}
              onChange={(v) => setVoteAmount(v.target.value)}
              placeholder="amount"
            ></input>
            <button
              onClick={() => vote(voteProjectPubkey, parseInt(voteAmount))}
            >
              Vote
            </button>
          </div>
          <div>
            <input
              type="text"
              value={withdrawProjectPubkey}
              onChange={(v) => setWithdrawProjectPubkey(v.target.value)}
              placeholder="project pubkey (base58)"
            ></input>
            <input
              type="text"
              value={withdrawToPubkey}
              onChange={(v) => setWithdrawToPubkey(v.target.value)}
              placeholder="to pubkey (base58)"
            ></input>
            <button
              onClick={() => withdraw(withdrawProjectPubkey, withdrawToPubkey)}
            >
              Withdraw
            </button>
          </div>
          <div>
            <input
              type="text"
              value={banProjectPubkey}
              onChange={(v) => setBanProjectPubkey(v.target.value)}
              placeholder="project pubkey (base58)"
            ></input>
            <input
              type="text"
              pattern="[0-9]*"
              value={banAmount}
              onChange={(v) => setBanAmount(v.target.value)}
              placeholder="amount"
            ></input>
            <button
              onClick={() => banProject(banProjectPubkey, banAmount)}
            >
              Ban
            </button>
          </div>
          <div>
            <input
              type="text"
              value={closeRoundPubkey}
              onChange={(v) => setCloseRoundPubkey(v.target.value)}
              placeholder="round pubkey (base58)"
            ></input>
            <button onClick={() => endRound(closeRoundPubkey)}>
              End Round
            </button>
          </div>
          <div>
            <input
              type="text"
              value={withdrawFeeRoundPubkey}
              onChange={(v) => setWithdrawFeeRoundPubkey(v.target.value)}
              placeholder="round pubkey (base58)"
            ></input>
            <input
              type="text"
              value={withdrawFeeToPubkey}
              onChange={(v) => setWithdrawFeeToPubkey(v.target.value)}
              placeholder="to pubkey (base58)"
            ></input>
            <button
              onClick={() => withdrawFee(withdrawFeeRoundPubkey, withdrawFeeToPubkey)}
            >
              Withdraw Fee
            </button>
          </div>
        </div>
      ) : (
        <div>connect wallet first</div>
      )}
      <div>
        <h1>Query</h1>
      </div>
      <div>
        <input
          type="text"
          value={testPubkey}
          onChange={(v) => setTestPubkey(v.target.value)}
        ></input>
        <button onClick={() => test(testPubkey)}>
          test
        </button>
      </div>
      <div>
        <input
          type="text"
          value={getRoundInfoPubkey}
          onChange={(v) => setGetRoundInfoPubkey(v.target.value)}
        ></input>
        <button onClick={() => getRoundInfo(getRoundInfoPubkey)}>
          get round info
        </button>
      </div>
      <div>
        <input
          type="text"
          value={getProjectInfoPubkey}
          onChange={(v) => setGetProjectInfoPubkey(v.target.value)}
        ></input>
        <button onClick={() => getProjectInfo(getProjectInfoPubkey)}>
          get project info
        </button>
      </div>
      <div>
        <input
          type="text"
          value={getVoterInfoPubkey}
          onChange={(v) => setGetVoterInfoPubkey(v.target.value)}
        ></input>
        <button onClick={() => getVoterInfo(getVoterInfoPubkey)}>
          get voter info
        </button>
      </div>
      <div>
        <h1>Output</h1>
      </div>
      <div>
        {output.split("\n").map((str) => (
          <p>{str}</p>
        ))}
      </div>
    </div>
  );
};

// helper function

enum Instruction {
  StartRound,
  Donate, //  { amount: u64, decimals: u8 },
  RegisterProject,
  InitVoter,
  Vote, // { amount: u64, decimals: u8 },
  Withdraw,
  EndRound,
  WithdrawFee,
  BanProject, // { ban_amount: U256 },
}

function createStartRoundInstruction(
  programId: PublicKey,
  newRoundPubkey: PublicKey,
  ownerPubkey: PublicKey,
  vaultPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"), 
    BufferLayout.u8("ratio"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.StartRound,
      ratio: 20,
    },
    data
  );

  let keys = [
    {
      pubkey: newRoundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: vaultPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function registerProjectInstruction(
  programId: PublicKey,
  newProjectPubkey: PublicKey,
  roundPubkey: PublicKey,
  projectOwnerPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.RegisterProject,
    },
    data
  );

  let keys = [
    {
      pubkey: newProjectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: projectOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function initVoterInstruction(
  programId: PublicKey,
  voterPubkey: PublicKey,
  voterTokenHolderPubkey: PublicKey,
  projectPubkey: PublicKey,
  fromPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.InitVoter,
    },
    data
  );

  let keys = [
    {
      pubkey: voterPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: voterTokenHolderPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: fromPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function donateInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuthPubkey: PublicKey,
  amount: number,
  decimals: number
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(8, "amount"),
    BufferLayout.u8("decimals"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Donate,
      amount: Buffer.from(new BN(amount).toArray("le", 8)),
      decimals,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mintPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromAuthPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function voteInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  projectPubkey: PublicKey,
  voterPubkey: PublicKey,
  fromPubkey: PublicKey,
  mintPubkey: PublicKey,
  toPubkey: PublicKey,
  fromAuthPubkey: PublicKey,
  amount: number,
  decimals: number
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(8, "amount"),
    BufferLayout.u8("decimals"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Vote,
      amount: Buffer.from(new BN(amount).toArray("le", 8)),
      decimals,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: voterPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: mintPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: fromAuthPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function withdrawInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  projectPubkey: PublicKey,
  projectOwnerPubkey: PublicKey,
  toPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.Withdraw,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: projectOwnerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function endRoundInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  ownerPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.EndRound,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function withdrawFeeInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  ownerPubkey: PublicKey,
  vaultPubkey: PublicKey,
  vaultOwnerPubkey: PublicKey,
  toPubkey: PublicKey
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([BufferLayout.u8("instruction")]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.WithdrawFee,
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: vaultPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: vaultOwnerPubkey,
      isSigner: false,
      isWritable: false,
    },
    {
      pubkey: toPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: SPLToken.TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

function banProjectInstruction(
  programId: PublicKey,
  roundPubkey: PublicKey,
  ownerPubkey: PublicKey,
  projectPubkey: PublicKey,
  amount: string,
): TransactionInstruction {
  const dataLayout = BufferLayout.struct([
    BufferLayout.u8("instruction"),
    BufferLayout.blob(32, "ban_amount"),
  ]);

  const data = Buffer.alloc(dataLayout.span);
  dataLayout.encode(
    {
      instruction: Instruction.BanProject,
      ban_amount: Buffer.from(new BN(amount).toArray("le", 32))
    },
    data
  );

  let keys = [
    {
      pubkey: roundPubkey,
      isSigner: false,
      isWritable: true,
    },
    {
      pubkey: ownerPubkey,
      isSigner: true,
      isWritable: false,
    },
    {
      pubkey: projectPubkey,
      isSigner: false,
      isWritable: true,
    },
  ];

  return new TransactionInstruction({
    keys,
    programId: programId,
    data,
  });
}

async function getVaultOwnerPubkey(
  owner: PublicKey,
  programId: PublicKey
): Promise<PublicKey> {
  let [pda] = await PublicKey.findProgramAddress([owner.toBuffer()], programId);
  return pda;
}

async function getVoterPubkey(
  project: PublicKey,
  voterTokenAccountPubkey: PublicKey,
  programId: PublicKey
): Promise<PublicKey> {
  let [pda] = await PublicKey.findProgramAddress(
    [project.toBuffer(), voterTokenAccountPubkey.toBuffer()],
    programId
  );
  return pda;
}
