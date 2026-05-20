import { PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  TOKEN_PROGRAM_ID,
  Token,
  u64,
} = splToken;

export { TOKEN_PROGRAM_ID };
export const AuthorityType = splToken.AuthorityType || { MintTokens: 'MintTokens' };

export async function getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve = false) {
  if (typeof splToken.getAssociatedTokenAddress === 'function') {
    return splToken.getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve);
  }

  return Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
    allowOwnerOffCurve
  );
}

export async function getAccount(connection, address, commitment) {
  if (typeof splToken.getAccount === 'function') {
    return splToken.getAccount(connection, address, commitment);
  }

  const info = await connection.getAccountInfo(address, commitment);
  if (!info) {
    throw new Error('Failed to find account');
  }
  if (!info.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error('Invalid account owner');
  }
  if (info.data.length !== AccountLayout.span) {
    throw new Error('Invalid account size');
  }

  const accountInfo = AccountLayout.decode(Buffer.from(info.data));
  accountInfo.address = address;
  accountInfo.mint = new PublicKey(accountInfo.mint);
  accountInfo.owner = new PublicKey(accountInfo.owner);
  accountInfo.amount = u64.fromBuffer(accountInfo.amount);
  return accountInfo;
}

export function createAssociatedTokenAccountInstruction(payer, associatedAccount, owner, mint) {
  if (typeof splToken.createAssociatedTokenAccountInstruction === 'function') {
    return splToken.createAssociatedTokenAccountInstruction(payer, associatedAccount, owner, mint);
  }

  return Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    associatedAccount,
    owner,
    payer
  );
}

export async function createMint(
  connection,
  payer,
  mintAuthority,
  freezeAuthority,
  decimals
) {
  if (typeof splToken.createMint === 'function') {
    return splToken.createMint(connection, payer, mintAuthority, freezeAuthority, decimals);
  }

  const token = await Token.createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
    TOKEN_PROGRAM_ID
  );
  return token.publicKey;
}

export async function getOrCreateAssociatedTokenAccount(connection, payer, mint, owner) {
  if (typeof splToken.getOrCreateAssociatedTokenAccount === 'function') {
    return splToken.getOrCreateAssociatedTokenAccount(connection, payer, mint, owner);
  }

  const token = new Token(connection, mint, TOKEN_PROGRAM_ID, payer);
  return token.getOrCreateAssociatedAccountInfo(owner);
}

export async function mintTo(connection, payer, mint, destination, authority, amount) {
  if (typeof splToken.mintTo === 'function') {
    return splToken.mintTo(connection, payer, mint, destination, authority, amount);
  }

  const transaction = new Transaction().add(
    Token.createMintToInstruction(TOKEN_PROGRAM_ID, mint, destination, authority, [], amount)
  );
  return sendAndConfirmTransaction(connection, transaction, [payer]);
}

export async function setAuthority(
  connection,
  payer,
  account,
  currentAuthority,
  authorityType,
  newAuthority
) {
  if (typeof splToken.setAuthority === 'function') {
    return splToken.setAuthority(
      connection,
      payer,
      account,
      currentAuthority,
      authorityType,
      newAuthority
    );
  }

  const transaction = new Transaction().add(
    Token.createSetAuthorityInstruction(
      TOKEN_PROGRAM_ID,
      account,
      newAuthority,
      authorityType,
      currentAuthority,
      []
    )
  );
  return sendAndConfirmTransaction(connection, transaction, [payer]);
}
