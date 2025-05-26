const web3 = require("@solana/web3.js");
const bs58 = require("bs58");
const dotenv = require("dotenv");
const splToken = require("@solana/spl-token");

dotenv.config();

const myRpcUrl = process.env.RPC_URL;
const connection = new web3.Connection(myRpcUrl, "confirmed");

const walletAPrivateKey = process.env.WALLET_A_PRIVATE_KEY;
const walletBAddress = process.env.WALLET_B_ADDRESS;
const walletCPrivateKey = process.env.WALLET_C_PRIVATE_KEY;

if (!walletAPrivateKey || !walletBAddress || !walletCPrivateKey) {
  console.error(
    "Missing WALLET_A_PRIVATE_KEY, WALLET_B_ADDRESS, or WALLET_C_PRIVATE_KEY in the .env file"
  );
  process.exit(1);
}

const walletA = web3.Keypair.fromSecretKey(bs58.decode(walletAPrivateKey));
const walletBPublicKey = new web3.PublicKey(walletBAddress);
const walletC = web3.Keypair.fromSecretKey(bs58.decode(walletCPrivateKey));

const transferTokens = async () => {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletA.publicKey,
      {
        programId: splToken.TOKEN_PROGRAM_ID,
      }
    );

    for (const { account } of tokenAccounts.value) {
      const tokenAccountInfo = account.data.parsed.info;
      const tokenMintAddress = tokenAccountInfo.mint;
      const tokenBalance = tokenAccountInfo.tokenAmount.amount; // Use 'amount' for raw balance

      if (tokenBalance > 0) {
        const fromTokenAccountInfo =
          await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            walletA,
            new web3.PublicKey(tokenMintAddress),
            walletA.publicKey
          );

        let toTokenAccountInfo;
        try {
          toTokenAccountInfo = await splToken.getOrCreateAssociatedTokenAccount(
            connection,
            walletC, // Use wallet C to create the account if it doesn't exist
            new web3.PublicKey(tokenMintAddress),
            walletBPublicKey,
            false // Do not automatically create the account
          );
        } catch (error) {
          // If the associated token account does not exist, create it
          toTokenAccountInfo = await splToken.createAssociatedTokenAccount(
            walletC,
            walletBPublicKey,
            new web3.PublicKey(tokenMintAddress)
          );
        }

        let transaction = new web3.Transaction().add(
          splToken.createTransferInstruction(
            fromTokenAccountInfo.address,
            toTokenAccountInfo.address,
            walletA.publicKey,
            tokenBalance,
            [],
            splToken.TOKEN_PROGRAM_ID
          )
        );

        transaction.feePayer = walletC.publicKey; // Set wallet C as the transaction fee payer

        let signers = [walletA, walletC]; // Signers must include both wallet A and wallet C

        const signature = await web3.sendAndConfirmTransaction(
          connection,
          transaction,
          signers,
          { commitment: "confirmed" }
        );

        console.log(
          `Transferred ${tokenBalance} tokens of mint ${tokenMintAddress} successfully. Signature: ${signature}`
        );
      }
    }
  } catch (error) {
    console.error("An error occurred during the transfer:", error);
  }
};

// Set interval for continuous checking and transferring tokens
setInterval(() => {
  transferTokens()
    .then(() => {
      console.log("Checked and transferred tokens.");
    })
    .catch((error) => {
      console.error("An error occurred in the transfer process:", error);
    });
}, 1000); // Adjust the interval as needed

// Start the transfer process
transferTokens();
