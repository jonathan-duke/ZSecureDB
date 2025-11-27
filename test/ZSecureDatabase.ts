import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ZSecureDatabase, ZSecureDatabase__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  owner: HardhatEthersSigner;
  other: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("ZSecureDatabase")) as ZSecureDatabase__factory;
  const contract = (await factory.deploy()) as ZSecureDatabase;
  const contractAddress = await contract.getAddress();
  return { contract, contractAddress };
}

describe("ZSecureDatabase", function () {
  let signers: Signers;
  let contract: ZSecureDatabase;
  let contractAddress: string;

  before(async function () {
    const [owner, other] = await ethers.getSigners();
    signers = { owner, other };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite only runs against the local FHEVM mock environment");
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  async function createDatabaseForTest(name: string) {
    const secureWallet = Wallet.createRandom();
    const encryptedAddress = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(secureWallet.address)
      .encrypt();

    const databaseId = await contract
      .connect(signers.owner)
      .createDatabase.staticCall(name, encryptedAddress.handles[0], encryptedAddress.inputProof);

    const tx = await contract
      .connect(signers.owner)
      .createDatabase(name, encryptedAddress.handles[0], encryptedAddress.inputProof);
    await tx.wait();

    return { databaseId: Number(databaseId), secureWallet };
  }

  it("creates databases and decrypts the stored access address", async function () {
    const { databaseId, secureWallet } = await createDatabaseForTest("Vault A");

    const metadata = await contract.getDatabaseMetadata(databaseId);
    expect(metadata.name).to.equal("Vault A");
    expect(metadata.owner).to.equal(signers.owner.address);
    expect(metadata.valueCount).to.equal(0n);

    const encryptedAddress = await contract.getEncryptedDatabaseAddress(databaseId);
    const encryptedAddressHandle = ethers.hexlify(encryptedAddress);
    const decryptedAddress = await fhevm.userDecryptEaddress(
      encryptedAddressHandle,
      contractAddress,
      signers.owner,
    );
    expect(decryptedAddress.toLowerCase()).to.equal(secureWallet.address.toLowerCase());
  });

  it("stores encrypted values that can be decrypted by the owner", async function () {
    const { databaseId, secureWallet } = await createDatabaseForTest("Vault B");

    const ciphertexts = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(secureWallet.address)
      .add32(777)
      .encrypt();

    const tx = await contract
      .connect(signers.owner)
      .storeEncryptedValue(databaseId, ciphertexts.handles[1], ciphertexts.handles[0], ciphertexts.inputProof);
    await tx.wait();

    const metadata = await contract.getDatabaseMetadata(databaseId);
    expect(metadata.valueCount).to.equal(1n);

    const entry = await contract.getEncryptedValue(databaseId, 0);
    const entryHandle = ethers.hexlify(entry.cipher);
    const decryptedValue = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      entryHandle,
      contractAddress,
      signers.owner,
    );
    expect(decryptedValue).to.equal(777n);
  });

  it("grants value access to another account", async function () {
    const { databaseId, secureWallet } = await createDatabaseForTest("Vault Shared");

    const ciphertexts = await fhevm
      .createEncryptedInput(contractAddress, signers.owner.address)
      .addAddress(secureWallet.address)
      .add32(42)
      .encrypt();
    await (await contract
      .connect(signers.owner)
      .storeEncryptedValue(databaseId, ciphertexts.handles[1], ciphertexts.handles[0], ciphertexts.inputProof)).wait();

    await (await contract
      .connect(signers.owner)
      .shareEncryptedValue(databaseId, 0, signers.other.address)).wait();

    const entry = await contract.getEncryptedValue(databaseId, 0);
    const entryHandle = ethers.hexlify(entry.cipher);
    const decryptedValueByOther = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      entryHandle,
      contractAddress,
      signers.other,
    );

    expect(decryptedValueByOther).to.equal(42n);
  });
});
