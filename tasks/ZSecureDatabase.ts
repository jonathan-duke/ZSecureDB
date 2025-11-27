import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:database-address", "Prints the ZSecureDatabase deployment address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = await deployments.get("ZSecureDatabase");
    console.log(`ZSecureDatabase address: ${deployment.address}`);
  },
);

task("task:create-database", "Creates an encrypted database")
  .addParam("name", "Database name")
  .addParam("address", "Random address A to encrypt")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ZSecureDatabase");
    const contract = await ethers.getContractAt("ZSecureDatabase", deployment.address);
    const [signer] = await ethers.getSigners();

    const encryptedAddress = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .addAddress(taskArguments.address as string)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .createDatabase(taskArguments.name as string, encryptedAddress.handles[0], encryptedAddress.inputProof);

    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`createDatabase status=${receipt?.status}`);
  });

task("task:decrypt-database-address", "Decrypts the encrypted address A stored in a database")
  .addParam("id", "Database identifier")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ZSecureDatabase");
    const contract = await ethers.getContractAt("ZSecureDatabase", deployment.address);
    const [signer] = await ethers.getSigners();

    const cipher = await contract.getEncryptedDatabaseAddress(Number(taskArguments.id));
    const clearAddress = await fhevm.userDecryptEaddress(
      FhevmType.eaddress,
      cipher,
      deployment.address,
      signer,
    );

    console.log(`Database ${taskArguments.id} decrypted address: ${clearAddress}`);
  });

task("task:add-database-value", "Encrypts a number with address A and stores it")
  .addParam("id", "Database identifier")
  .addParam("value", "Plain number to encrypt")
  .addParam("encryptionaddress", "Decrypted address A used for encryption")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ZSecureDatabase");
    const contract = await ethers.getContractAt("ZSecureDatabase", deployment.address);
    const [signer] = await ethers.getSigners();

    const value = parseInt(taskArguments.value);
    if (!Number.isFinite(value)) {
      throw new Error(`Argument --value must be a valid integer`);
    }

    const ciphertexts = await fhevm
      .createEncryptedInput(deployment.address, (await signer.getAddress()) as string)
      .addAddress(taskArguments.encryptionaddress as string)
      .add32(value)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .storeEncryptedValue(
        Number(taskArguments.id),
        ciphertexts.handles[1],
        ciphertexts.handles[0],
        ciphertexts.inputProof,
      );
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`storeEncryptedValue status=${receipt?.status}`);
  });

task("task:decrypt-database-value", "Decrypts a stored encrypted number")
  .addParam("id", "Database identifier")
  .addParam("index", "Entry index")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("ZSecureDatabase");
    const contract = await ethers.getContractAt("ZSecureDatabase", deployment.address);
    const [signer] = await ethers.getSigners();

    const entry = await contract.getEncryptedValue(Number(taskArguments.id), Number(taskArguments.index));
    const clearValue = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      entry.cipher,
      deployment.address,
      signer,
    );

    console.log(`Database ${taskArguments.id} entry ${taskArguments.index} decrypted value: ${clearValue}`);
  });
