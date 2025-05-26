import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import * as dotenv from "dotenv";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
} from "@solana/spl-token";

dotenv.config();

const myRpcUrl = process.env.RPC_URL;
const connection = new Connection(myRpcUrl, "confirmed");

const walletAPrivateKey = process.env.WALLET_A_PRIVATE_KEY;
const walletBAddress = process.env.WALLET_B_ADDRESS;
const walletCPrivateKey = process.env.WALLET_C_PRIVATE_KEY;

if (!walletAPrivateKey || !walletBAddress || !walletCPrivateKey) {
  console.error(
    "Missing WALLET_A_PRIVATE_KEY, WALLET_B_ADDRESS, or WALLET_C_PRIVATE_KEY in .env"
  );
  process.exit(1);
}

const walletA = Keypair.fromSecretKey(bs58.decode(walletAPrivateKey));
const walletBPublicKey = new PublicKey(walletBAddress);
const walletC = Keypair.fromSecretKey(bs58.decode(walletCPrivateKey));

const transferTokens = async () => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletA.publicKey,
      {
        programId: TOKEN_PROGRAM_ID,
      }
    );

    for (const { account } of tokenAccounts.value) {
      const tokenAccountInfo = account.data.parsed.info;
      const tokenMintAddress = new PublicKey(tokenAccountInfo.mint);
      const tokenBalance = tokenAccountInfo.tokenAmount.amount;

      if (tokenBalance > 0) {
        // Get or create source token account (Wallet A)
        const fromTokenAccount = getAssociatedTokenAddressSync(
          tokenMintAddress,
          walletA.publicKey
        );

        // Get or create destination token account (Wallet B)
        const toTokenAccount = getAssociatedTokenAddressSync(
          tokenMintAddress,
          walletBPublicKey
        );

        // Check if destination token account exists
        let toTokenAccountExists;
        try {
          await getAccount(connection, toTokenAccount);
          toTokenAccountExists = true;
        } catch (error) {
          toTokenAccountExists = false;
        }

        // Build transaction
        const instructions = [];

        // Create ATA if needed (funded by Wallet C)
        if (!toTokenAccountExists) {
          instructions.push(
            createAssociatedTokenAccountInstruction(
              walletC.publicKey,
              toTokenAccount,
              walletBPublicKey,
              tokenMintAddress
            )
          );
        }

        // Add transfer instruction (signed by Wallet A)
        instructions.push(
          createTransferInstruction(
            fromTokenAccount,
            toTokenAccount,
            walletA.publicKey,
            tokenBalance,
            [],
            TOKEN_PROGRAM_ID
          )
        );

        // Send transaction (signed by Wallet A and Wallet C)
        const tx = new VersionedTransaction(
          await connection.getLatestBlockhash(),
          instructions
        );

        tx.sign([walletA, walletC]);

        const signature = await sendAndConfirmTransaction(connection, tx, {
          commitment: "confirmed",
        });

        console.log(
          `✅ Transferred ${tokenBalance} tokens (Mint: ${tokenMintAddress}).\nSignature: ${signature}`
        );
      }
    }
  } catch (error) {
    console.error("❌ Transfer failed:", error);
  }
};

// Run every 5 seconds (adjust as needed)
setInterval(transferTokens, 5000);

// Initial run
transferTokens();
