import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Contract, Wallet } from 'ethers';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/DatabaseCreator.css';

type WalletSeed = {
  address: string;
  privateKey: string;
};

function createWalletSeed(): WalletSeed {
  const generated = Wallet.createRandom();
  return { address: generated.address, privateKey: generated.privateKey };
}

export function DatabaseCreator() {
  const { address } = useAccount();
  const { instance, isLoading } = useZamaInstance();
  const signerPromise = useEthersSigner();
  const [databaseName, setDatabaseName] = useState('');
  const [walletSeed, setWalletSeed] = useState<WalletSeed>(() => createWalletSeed());
  const [isCreating, setIsCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const regenerateWallet = () => {
    setWalletSeed(createWalletSeed());
    setTxHash(null);
    setStatusMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!instance || !address) {
      setStatusMessage('Connect your wallet and wait for the encryption SDK to initialize.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setStatusMessage('Unable to access the connected wallet signer');
      return;
    }

    try {
      setIsCreating(true);
      setStatusMessage('Encrypting database address...');
      setTxHash(null);

      const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      buffer.addAddress(walletSeed.address);
      const encryptedInput = await buffer.encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setStatusMessage('Submitting transaction to create the database...');
      const tx = await contract.createDatabase(databaseName.trim(), encryptedInput.handles[0], encryptedInput.inputProof);
      const receipt = await tx.wait();

      setStatusMessage('Database created successfully. Keep the address and private key safe.');
      setTxHash(receipt?.hash ?? tx.hash);
    } catch (error) {
      console.error('Failed to create database', error);
      setStatusMessage(error instanceof Error ? error.message : 'Failed to create database');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="database-card">
      <h2 className="database-card-title">Create encrypted database</h2>
      <p className="database-card-description">
        Every database is protected by a randomly generated EVM address. Only the encrypted handle is stored on-chain,
        so make sure you save the credentials displayed below.
      </p>

      <div className="wallet-panel">
        <div className="wallet-header">
          <div>
            <p className="wallet-label">Database address A</p>
            <p className="wallet-value">{walletSeed.address}</p>
          </div>
          <button type="button" onClick={regenerateWallet} className="ghost-button">
            Generate new
          </button>
        </div>
        <div className="wallet-secret">
          <p className="wallet-label">Private key</p>
          <p className="wallet-value monospace">{walletSeed.privateKey}</p>
          <p className="wallet-hint">Store this offline. It is never sent to the blockchain.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="database-form">
        <label className="form-label" htmlFor="database-name">
          Database name
        </label>
        <input
          id="database-name"
          type="text"
          className="text-input"
          placeholder="e.g., MarketingStats"
          value={databaseName}
          onChange={(event) => setDatabaseName(event.target.value)}
          required
        />

        <button type="submit" className="primary-button" disabled={!address || !instance || isCreating || databaseName.trim() === ''}>
          {isLoading && 'Preparing encryption...'}
          {!isLoading && isCreating && 'Creating database...'}
          {!isLoading && !isCreating && 'Create database'}
        </button>
      </form>

      {statusMessage && <p className="status-message">{statusMessage}</p>}
      {txHash && (
        <p className="status-message">
          Transaction hash: <span className="monospace">{txHash}</span>
        </p>
      )}

      {!address && <p className="status-message warning">Connect your wallet to deploy a database.</p>}
    </div>
  );
}
