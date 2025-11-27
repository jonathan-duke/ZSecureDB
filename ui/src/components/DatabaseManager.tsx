import { useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/DatabaseManager.css';

type DatabaseMetadata = {
  name: string;
  owner: string;
  createdAt: bigint;
  updatedAt: bigint;
  valueCount: bigint;
};

type EntryDisplay = {
  index: number;
  cipher: string;
  timestamp: number;
  submittedBy: string;
  decryptedValue?: string;
  decrypting?: boolean;
};

export function DatabaseManager() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { instance } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [selectedId, setSelectedId] = useState<string>('');
  const [entries, setEntries] = useState<EntryDisplay[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [decryptedAddress, setDecryptedAddress] = useState('');
  const [decryptingAddress, setDecryptingAddress] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [isSavingValue, setIsSavingValue] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { data: databasesData, refetch: refetchDatabases } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getOwnerDatabases',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const databaseIds = useMemo(() => {
    if (!Array.isArray(databasesData)) {
      return [] as string[];
    }
    return (databasesData as bigint[]).map((id) => id.toString());
  }, [databasesData]);

  const { data: metadataData, refetch: refetchMetadata } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getDatabaseMetadata',
    args: selectedId ? [BigInt(selectedId)] : undefined,
    query: { enabled: !!selectedId },
  });

  const metadata = useMemo<DatabaseMetadata | undefined>(() => {
    if (!metadataData) {
      return undefined;
    }

    if (Array.isArray(metadataData)) {
      const [name, owner, createdAt, updatedAt, valueCount] = metadataData as readonly [
        string,
        string,
        bigint,
        bigint,
        bigint,
      ];
      return { name, owner, createdAt, updatedAt, valueCount };
    }

    if (typeof metadataData === 'object') {
      const typed = metadataData as {
        name?: string;
        owner?: string;
        createdAt?: bigint;
        updatedAt?: bigint;
        valueCount?: bigint;
      };
      if (typed.name && typed.owner && typed.createdAt !== undefined && typed.updatedAt !== undefined && typed.valueCount !== undefined) {
        return {
          name: typed.name,
          owner: typed.owner,
          createdAt: typed.createdAt,
          updatedAt: typed.updatedAt,
          valueCount: typed.valueCount,
        };
      }
    }

    return undefined;
  }, [metadataData]);

  const { data: encryptedAddressHandle } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getEncryptedDatabaseAddress',
    args: selectedId ? [BigInt(selectedId)] : undefined,
    query: { enabled: !!selectedId },
  });

  useEffect(() => {
    if (databaseIds.length === 0) {
      setSelectedId('');
      return;
    }
    if (!selectedId || !databaseIds.includes(selectedId)) {
      setSelectedId(databaseIds[0]);
    }
  }, [databaseIds, selectedId]);

  useEffect(() => {
    setDecryptedAddress('');
    setEntries([]);
    setToastMessage(null);
  }, [selectedId]);

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) {
      return '-';
    }
    return new Date(timestamp * 1000).toLocaleString();
  };

  const loadEntries = async () => {
    if (!publicClient || !selectedId || !metadata) {
      return;
    }
    const valueCount = Number(metadata.valueCount ?? 0n);
    if (valueCount === 0) {
      setEntries([]);
      return;
    }

    setLoadingEntries(true);
    try {
      const reads = Array.from({ length: valueCount }).map((_, index) =>
        publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getEncryptedValue',
          args: [BigInt(selectedId), BigInt(index)],
        }) as Promise<{ cipher: string; timestamp: bigint; submittedBy: string }>,
      );

      const results = await Promise.all(reads);
      const mapped: EntryDisplay[] = results.map((entry, index) => ({
        index,
        cipher: entry.cipher,
        timestamp: Number(entry.timestamp),
        submittedBy: entry.submittedBy,
      }));
      setEntries(mapped);
    } catch (error) {
      console.error('Failed to load entries', error);
      setToastMessage('Unable to load encrypted values.');
    } finally {
      setLoadingEntries(false);
    }
  };

  const requestUserDecryption = async (handles: string[]) => {
    if (!instance || !address) {
      throw new Error('Encryption SDK not ready');
    }
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Unable to access the connected wallet signer');
    }

    const startTimeStamp = Math.floor(Date.now() / 1000).toString();
    const durationDays = '7';
    const contractAddresses = [CONTRACT_ADDRESS];
    const keypair = instance.generateKeypair();
    const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
    const signature = await signer.signTypedData(
      eip712.domain,
      {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
      },
      eip712.message,
    );

    return instance.userDecrypt(
      handles.map((handle) => ({ handle, contractAddress: CONTRACT_ADDRESS })),
      keypair.privateKey,
      keypair.publicKey,
      signature.replace('0x', ''),
      contractAddresses,
      address,
      startTimeStamp,
      durationDays,
    );
  };

  const handleDecryptAddress = async () => {
    if (!encryptedAddressHandle || !selectedId) {
      return;
    }
    setDecryptingAddress(true);
    try {
      const signer = await signerPromise;
      if (!signer || !address) {
        throw new Error('Wallet connection is required');
      }
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await contract.refreshAddressAccess(BigInt(selectedId), address);

      const result = await requestUserDecryption([encryptedAddressHandle as string]);
      const decrypted = result[encryptedAddressHandle as string];
      if (decrypted) {
        setDecryptedAddress(decrypted);
      }
      setToastMessage('Database address decrypted locally.');
    } catch (error) {
      console.error('Failed to decrypt address', error);
      setToastMessage(error instanceof Error ? error.message : 'Unable to decrypt address');
    } finally {
      setDecryptingAddress(false);
    }
  };

  const handleStoreValue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!instance || !address || !selectedId || decryptedAddress === '') {
      setToastMessage('Decrypt the database address before storing values.');
      return;
    }

    const parsedValue = Number(newValue);
    if (!Number.isFinite(parsedValue)) {
      setToastMessage('Provide a valid numeric value.');
      return;
    }

    const signer = await signerPromise;
    if (!signer) {
      setToastMessage('Unable to access the connected wallet signer');
      return;
    }

    try {
      setIsSavingValue(true);
      const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      buffer.addAddress(decryptedAddress);
      buffer.add32(parsedValue);
      const encryptedInput = await buffer.encrypt();

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.storeEncryptedValue(
        BigInt(selectedId),
        encryptedInput.handles[1],
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      await tx.wait();

      setToastMessage('Encrypted value saved successfully.');
      setNewValue('');
      await loadEntries();
      await refetchMetadata();
      await refetchDatabases();
    } catch (error) {
      console.error('Failed to store value', error);
      setToastMessage(error instanceof Error ? error.message : 'Unable to store value');
    } finally {
      setIsSavingValue(false);
    }
  };

  const handleDecryptEntry = async (entry: EntryDisplay) => {
    if (!selectedId) {
      return;
    }

    setEntries((prev) =>
      prev.map((item) => (item.index === entry.index ? { ...item, decrypting: true, decryptedValue: undefined } : item)),
    );

    try {
      const result = await requestUserDecryption([entry.cipher]);
      const decrypted = result[entry.cipher];
      setEntries((prev) =>
        prev.map((item) =>
          item.index === entry.index
            ? { ...item, decryptedValue: decrypted ?? '0', decrypting: false }
            : item,
        ),
      );
    } catch (error) {
      console.error('Failed to decrypt entry', error);
      setEntries((prev) => prev.map((item) => (item.index === entry.index ? { ...item, decrypting: false } : item)));
      setToastMessage('Unable to decrypt this value.');
    }
  };

  if (!address) {
    return (
      <div className="database-card">
        <p className="status-message">Connect your wallet to manage encrypted databases.</p>
      </div>
    );
  }

  return (
    <div className="manager-grid">
      <section className="database-card">
        <h2 className="database-card-title">Your databases</h2>
        {databaseIds.length === 0 && <p className="status-message">No databases deployed with this wallet yet.</p>}
        {databaseIds.length > 0 && (
          <div className="database-list">
            {databaseIds.map((id) => (
              <button
                key={id}
                type="button"
                className={`database-pill ${selectedId === id ? 'selected' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                #{id}
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedId && metadata && (
        <section className="database-card">
          <div className="metadata-header">
            <div>
              <p className="metadata-label">Name</p>
              <p className="metadata-value">{metadata.name}</p>
            </div>
            <div>
              <p className="metadata-label">Encrypted values</p>
              <p className="metadata-value">{metadata.valueCount.toString()}</p>
            </div>
            <div>
              <p className="metadata-label">Last updated</p>
              <p className="metadata-value">{formatTimestamp(Number(metadata.updatedAt))}</p>
            </div>
          </div>

          <div className="address-panel">
            <div>
              <p className="metadata-label">Decrypted address A</p>
              <p className="metadata-value monospace">
                {decryptedAddress || 'Decrypt to reveal the database address'}
              </p>
            </div>
            <button type="button" onClick={handleDecryptAddress} className="ghost-button" disabled={decryptingAddress}>
              {decryptingAddress ? 'Decrypting...' : 'Allow and decrypt'}
            </button>
          </div>

          <form className="value-form" onSubmit={handleStoreValue}>
            <label className="form-label" htmlFor="encrypted-value">
              Store numeric value
            </label>
            <input
              id="encrypted-value"
              type="number"
              className="text-input"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
              placeholder="Enter a number"
            />
            <button type="submit" className="primary-button" disabled={isSavingValue || decryptedAddress === ''}>
              {isSavingValue ? 'Encrypting and sending...' : 'Encrypt & save'}
            </button>
          </form>

          <div className="entries-header">
            <div>
              <p className="metadata-label">Encrypted values</p>
              <p className="metadata-value small">
                {entries.length}/{metadata.valueCount.toString()}
              </p>
            </div>
            <button type="button" className="ghost-button" onClick={loadEntries} disabled={loadingEntries}>
              {loadingEntries ? 'Loading...' : 'Load values'}
            </button>
          </div>

          {entries.length === 0 && !loadingEntries && (
            <p className="status-message">No encrypted numbers stored yet.</p>
          )}

          <div className="entry-list">
            {entries.map((entry) => (
              <div className="entry-row" key={entry.index}>
                <div>
                  <p className="entry-label">Entry #{entry.index}</p>
                  <p className="entry-value">Cipher: <span className="monospace">{entry.cipher}</span></p>
                  <p className="entry-meta">Saved: {formatTimestamp(entry.timestamp)}</p>
                  <p className="entry-meta">By: {entry.submittedBy}</p>
                  {entry.decryptedValue && (
                    <p className="entry-decrypted">Decrypted value: {entry.decryptedValue}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleDecryptEntry(entry)}
                  disabled={entry.decrypting}
                >
                  {entry.decrypting ? 'Decrypting...' : 'Decrypt value'}
                </button>
              </div>
            ))}
          </div>

          {toastMessage && <p className="status-message">{toastMessage}</p>}
        </section>
      )}
    </div>
  );
}
