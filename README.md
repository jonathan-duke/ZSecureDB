# ZSecureDB

ZSecureDB is a privacy-first on-chain database registry built with Zama's Fully Homomorphic Encryption (FHE) stack. Each database is protected by a randomly generated EVM address (address A) that never appears on-chain in plaintext. Owners encrypt data client-side, store ciphertexts on-chain, and selectively re-grant decryption rights without exposing secrets.

## Project Summary
- Create a database: the frontend generates address A locally, encrypts it through Zama's relayer, and stores the handle plus the database name on-chain.
- Use a database: the owner decrypts address A client-side, encrypts numbers with it, and persists ciphertext entries on-chain.
- Share access: owners can re-grant address A permissions and share individual encrypted values with other accounts while keeping the underlying plaintext hidden.
- Built for Sepolia: contracts and frontend target Sepolia; the same flow runs against the local FHEVM mock for development and testing.

## Key Advantages
- **End-to-end confidentiality:** Secrets never leave the client unencrypted; the contract only handles ciphertexts (eaddress and euint32).
- **Deterministic ACLs:** FHE ACL primitives (`FHE.allow`, `FHE.allowThis`) strictly control who can decrypt stored handles or values.
- **Auditable flows:** Events (`DatabaseCreated`, `DatabaseEntryStored`, `DatabaseAddressShared`, `DatabaseEntryShared`) expose operational traces without leaking plaintext.
- **Typed, tested stack:** TypeScript across contracts, tasks, and frontend; automated tests cover local mock FHEVM and Sepolia.
- **Ready-to-ship artifacts:** Hardhat Deploy outputs (in `deployments/`) drive both on-chain verification and the frontend ABI/source of truth.

## Problems ZSecureDB Solves
- Storing connection secrets or application addresses on-chain without revealing them.
- Enforcing that only database owners (or explicitly allowed accounts) can decrypt addresses and data.
- Allowing users to prove and persist encrypted inputs without running custom MPC/KMS flows themselves (handled by the relayer/KMS).
- Offering a practical pattern for FHE-based data vaults that can be extended to analytics, credential storage, or regulated data handling.

## How It Works
- **Smart contract (`contracts/ZSecureDatabase.sol`):**
  - Stores the encrypted address A and encrypted numeric entries (`euint32`) per database.
  - Uses Zama FHE primitives for equality checks, conditional writes, and ACL propagation.
  - Prevents unauthorized writes by requiring the owner to supply the correct encrypted address handle alongside new values.
  - Provides view helpers for metadata, encrypted address, encrypted entries, and owner database listings.
- **Frontend (`ui/`):**
  - React + Vite + RainbowKit for wallet UX; viem for reads, ethers for writes.
  - Integrates `@zama-fhe/relayer-sdk` to encrypt inputs, generate proofs, and perform user decryption without exposing plaintext.
  - Database creation tab: generate address A locally, encrypt, and deploy the database.
  - Management tab: decrypt address A (after re-granting ACL), encrypt and store numbers, load encrypted entries, and decrypt them client-side.
- **Relayer/KMS:** Handles ciphertext registration, proof generation, and user decryption requests; no local storage is used in the dapp.

## Tech Stack
- **Smart contracts:** Solidity 0.8.27, Zama FHEVM Solidity libs, Hardhat Deploy, TypeChain, Ethers v6.
- **Tooling:** Hardhat + `@fhevm/hardhat-plugin`, solhint, eslint/prettier, solidity-coverage, gas reporter.
- **Frontend:** React 19, Vite, RainbowKit/Wagmi, viem (reads), ethers (writes), `@zama-fhe/relayer-sdk`.
- **Network:** Sepolia (via Infura) for production-like flows; Hardhat local network with FHEVM mock for development/tests.

## Repository Layout
- `contracts/` – ZSecureDatabase contract (encrypted registry with ACL).
- `deploy/` – Hardhat Deploy script for ZSecureDatabase.
- `deployments/` – Generated artifacts per network (copy this ABI into the frontend).
- `tasks/` – Hardhat tasks for creating/decrypting databases and entries.
- `test/` – Local mock FHEVM tests and Sepolia integration test.
- `ui/` – Vite/React frontend (no Tailwind, no env vars).
- `docs/` – Zama protocol and relayer references used by the project.

## Prerequisites
- Node.js 20+
- npm 7+ (npm used for both root and `ui/`)
- A Sepolia RPC key (Infura) and a deployer private key (no mnemonic)

## Backend: Install, Test, Deploy
1. **Install**
   ```bash
   npm install
   ```
2. **Environment**
   Create `.env` with:
   ```bash
   INFURA_API_KEY=your_infura_key
   PRIVATE_KEY=your_sepolia_private_key   # private key only; do not use a mnemonic
   ETHERSCAN_API_KEY=optional_for_verification
   ```
3. **Compile & typechain**
   ```bash
   npm run compile
   ```
4. **Tests**
   - Local FHEVM mock: `npm test`
   - Sepolia integration: `npm run test:sepolia` (requires a deployed contract and funded PRIVATE_KEY)
5. **Local node + deploy**
   ```bash
   npm run chain            # start hardhat node
   npm run deploy:localhost # deploy ZSecureDatabase to localhost
   ```
6. **Sepolia deploy**
   ```bash
   npm run deploy:sepolia
   npm run verify:sepolia -- <DEPLOYED_ADDRESS>
   ```
   Deployment artifacts land in `deployments/sepolia/ZSecureDatabase.json`; use this ABI for the frontend.

## Useful Hardhat Tasks
- Get deployed address: `npx hardhat task:database-address --network sepolia`
- Create a database: `npx hardhat task:create-database --name "MyVault" --address <addressA> --network sepolia`
- Decrypt address A: `npx hardhat task:decrypt-database-address --id 1 --network sepolia`
- Store an encrypted number: `npx hardhat task:add-database-value --id 1 --value 123 --encryptionaddress <addressA> --network sepolia`
- Decrypt a stored value: `npx hardhat task:decrypt-database-value --id 1 --index 0 --network sepolia`

## Frontend Workflow (`ui/`)
1. **Install**
   ```bash
   cd ui
   npm install
   ```
2. **Configure contract + wallet project id**
   - Set `CONTRACT_ADDRESS` in `ui/src/config/contracts.ts` to the deployed ZSecureDatabase on Sepolia.
   - Replace `CONTRACT_ABI` in the same file with the ABI from `deployments/sepolia/ZSecureDatabase.json` (contract artifact is the single source of truth).
   - Set your WalletConnect `projectId` in `ui/src/config/wagmi.ts` (no environment variables are used).
3. **Run**
   ```bash
   npm run dev
   ```
4. **Dapp flows**
   - *Create Database:* generate address A in the browser, encrypt via relayer SDK, submit `createDatabase`, and receive the tx hash.
   - *Decrypt Address:* call `refreshAddressAccess`, request user decryption through the relayer, and display address A locally.
   - *Store Value:* encrypt a number together with address A, call `storeEncryptedValue`, and refresh metadata.
   - *Review & Decrypt Entries:* load ciphertext entries, request per-entry user decryption, and view clear values client-side.
   - *Share Access:* use contract methods (`refreshAddressAccess`, `shareEncryptedValue`) to grant other accounts decryption rights when needed.

## Security and Privacy Notes
- Plaintext secrets (address A, numbers) never touch the chain; only ciphertext handles are persisted.
- ACLs are re-granted explicitly per ciphertext; reconnecting wallets must refresh permissions before decrypting.
- View methods avoid `msg.sender`-based authorization to keep reads pure and inference-resistant.
- Frontend avoids localStorage/sessionStorage; all sensitive material stays in memory during the session.

## Future Plans
- Broader data types (encrypted strings/struct packing) and batching for lower gas.
- Role-based sharing flows and UI for `shareEncryptedValue`.
- Automated deployment + ABI sync pipeline between Hardhat and the frontend.
- Extended analytics/tests: gas profiling on Sepolia, fuzzing around ACL edge cases, and CI artifacts for deployments.
- Optional multi-chain support using additional FHEVM-configured networks beyond Sepolia.

## License
BSD-3-Clause-Clear. See `LICENSE` for full terms.
