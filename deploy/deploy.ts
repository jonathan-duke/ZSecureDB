import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedDatabase = await deploy("ZSecureDatabase", {
    from: deployer,
    log: true,
  });

  console.log(`ZSecureDatabase contract: `, deployedDatabase.address);
};
export default func;
func.id = "deploy_zsecure_database"; // id required to prevent reexecution
func.tags = ["ZSecureDatabase"];
