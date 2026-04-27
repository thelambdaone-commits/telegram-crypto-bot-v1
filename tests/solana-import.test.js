import { SolanaChain } from "../src/providers/solana.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

async function runTests() {
  const solana = new SolanaChain("https://api.mainnet-beta.solana.com");
  
  // Create a reference keypair
  const refKeypair = Keypair.generate();
  const address = refKeypair.publicKey.toString();
  const secretKey = refKeypair.secretKey; // 64 bytes
  const seed = secretKey.slice(0, 32); // 32 bytes seed

  console.log(`Reference Address: ${address}`);

  const testCases = [
    { name: "JSON Array (64 bytes)", input: JSON.stringify(Array.from(secretKey)) },
    { name: "Base58 (64 bytes)", input: bs58.encode(secretKey) },
    { name: "Base58 (32 bytes seed)", input: bs58.encode(seed) },
    { name: "Hex (64 bytes)", input: Buffer.from(secretKey).toString("hex") },
    { name: "Hex (32 bytes seed)", input: Buffer.from(seed).toString("hex") },
    { name: "Hex with 0x (64 bytes)", input: "0x" + Buffer.from(secretKey).toString("hex") },
  ];

  let passed = 0;
  for (const tc of testCases) {
    try {
      console.log(`Testing: ${tc.name}...`);
      const result = await solana.importFromKey(tc.input);
      if (result.address === address) {
        console.log(`✅ Success!`);
        passed++;
      } else {
        console.log(`❌ Failed! Got address: ${result.address}`);
      }
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
    }
  }

  console.log(`\nResult: ${passed}/${testCases.length} passed.`);
  
  if (passed === testCases.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
