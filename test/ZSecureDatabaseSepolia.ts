import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { Wallet } from "ethers";
import { ZSecureDatabase } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
};

describe("ZSecureDatabaseSepolia", function () {
  let contract: ZSecureDatabase;
  let contractAddress: string;
  let signers: Signers;
  let step = 0;
  let steps = 0;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This test suite runs only against Sepolia");
      this.skip();
    }

    try {
      const deployment = await deployments.get("ZSecureDatabase");
      contractAddress = deployment.address;
      contract = (await ethers.getContractAt("ZSecureDatabase", deployment.address)) as ZSecureDatabase;
    } catch (error) {
      (error as Error).message += ". Deploy the contract first with 'npx hardhat deploy --network sepolia'";
      throw error;
    }

    const [owner] = await ethers.getSigners();
    signers = { owner };
  });

  beforeEach(function () {
    step = 0;
    steps = 0;
  });

  it("creates a database and decrypts the stored values", async function () {
    steps = 8;
    this.timeout(4 * 40000);

    const secureWallet = Wallet.createRandom();

    progress("Encrypting access address...");
    const encryptedAddress = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(secureWallet.address)
      .encrypt();

    progress("Submitting createDatabase transaction...");
    const createTx = await contract
      .connect(signers.owner)
      .createDatabase("Sepolia Vault", encryptedAddress.handles[0], encryptedAddress.inputProof);
    await createTx.wait();

    const databaseId = (await contract.nextDatabaseId()) - 1n;
    progress(`Database created with id ${databaseId}`);

    progress("Decrypting stored address...");
    const cipher = await contract.getEncryptedDatabaseAddress(databaseId);
    const decryptedAddress = await fhevm.userDecryptEaddress(
      ethers.hexlify(cipher),
      contractAddress,
      signers.owner,
    );
    expect(decryptedAddress.toLowerCase()).to.equal(secureWallet.address.toLowerCase());

    progress("Encrypting numeric value using address A...");
    const ciphertexts = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(secureWallet.address)
      .add32(5)
      .encrypt();

    progress("Storing encrypted value on-chain...");
    const valueTx = await contract
      .connect(signers.owner)
      .storeEncryptedValue(databaseId, ciphertexts.handles[1], ciphertexts.handles[0], ciphertexts.inputProof);
    await valueTx.wait();

    progress("Fetching stored ciphertext...");
    const entry = await contract.getEncryptedValue(databaseId, 0);

    progress("Decrypting ciphertext via relayer...");
    const clearValue = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      ethers.hexlify(entry.cipher),
      contractAddress,
      signers.owner,
    );

    progress(`Decrypted value=${clearValue}`);
    expect(clearValue).to.be.a("bigint");
  });
});
