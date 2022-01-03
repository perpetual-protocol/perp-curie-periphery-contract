import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-etherscan"
import "@nomiclabs/hardhat-waffle"
import "@openzeppelin/hardhat-upgrades"
import "@tenderly/hardhat-tenderly"
import "@typechain/hardhat"
import * as dotenv from "dotenv"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import { HardhatUserConfig, task } from "hardhat/config"
import { ETHERSCAN_API_KEY } from "./constants"
import { getMnemonic, getUrl, hardhatForkConfig, tenderlyConfig } from "./scripts/hardhatConfig"
import { verifyOnEtherscan, verifyOnTenderly } from "./scripts/verify"

dotenv.config()

enum ChainId {
    ARBITRUM_ONE_CHAIN_ID = 42161,
    ARBITRUM_RINKEBY_CHAIN_ID = 421611,
    RINKEBY_CHAIN_ID = 4,
    OPTIMISM_KOVAN_CHAIN_ID = 69,
    OPTIMISM_CHAIN_ID = 10,
}

enum CompanionNetwork {
    optimism = "optimism",
    optimismKovan = "optimismKovan",
    rinkeby = "rinkeby",
    arbitrumRinkeby = "arbitrumRinkeby",
}

task("etherscanVerify", "Verify on etherscan")
    .addOptionalParam("contract", "Contract need to verify")
    .setAction(async ({ contract }, hre) => {
        await verifyOnEtherscan(hre, contract)
    })

task("tenderlyVerify", "Verify on tenderly")
    .addOptionalParam("contract", "Contract need to verify")
    .setAction(async ({ contract }, hre) => {
        const network = hre.network.name
        hre.config.tenderly = {
            project: tenderlyConfig[network],
            username: "perpprotocol",
        }
        await verifyOnTenderly(hre, contract)
    })

const config: HardhatUserConfig = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "berlin",
            // for smock to mock contracts
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
            saveDeployments: true,
            ...hardhatForkConfig(),
        },
        arbitrumRinkeby: {
            url: getUrl(CompanionNetwork.arbitrumRinkeby),
            accounts: {
                mnemonic: getMnemonic(CompanionNetwork.arbitrumRinkeby),
            },
            chainId: ChainId.ARBITRUM_RINKEBY_CHAIN_ID,
        },
        rinkeby: {
            url: getUrl(CompanionNetwork.rinkeby),
            accounts: {
                mnemonic: getMnemonic(CompanionNetwork.rinkeby),
            },
            chainId: ChainId.RINKEBY_CHAIN_ID,
        },
        optimismKovan: {
            url: getUrl(CompanionNetwork.optimismKovan),
            accounts: {
                mnemonic: getMnemonic(CompanionNetwork.optimismKovan),
            },
            chainId: ChainId.OPTIMISM_KOVAN_CHAIN_ID,
        },
        optimism: {
            url: getUrl(CompanionNetwork.optimism),
            accounts: {
                mnemonic: getMnemonic(CompanionNetwork.optimism),
            },
            chainId: ChainId.OPTIMISM_CHAIN_ID,
        },
    },
    namedAccounts: {
        deployer: 0, // 0 means ethers.getSigners[0]
        gnosisSafeAddress: {
            // It's EOA for now to test easier.
            [ChainId.OPTIMISM_KOVAN_CHAIN_ID]: "0x374152052700eDf29Fc2D4ed5eF93cA7d3fdF38e",
            [ChainId.OPTIMISM_CHAIN_ID]: "0x801B15C92075D85204d1b23054407DA63cc3105B",
        },
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
        alwaysGenerateOverloads: false,
        // there would be an error "MalformedAbiError: Not a valid ABI" since typechain doesn't recognize xxx.dbg.json,
        // so we must run "npm run clean-dbg" manually to remove those files
        externalArtifacts: [
            "./node_modules/@perp/curie-contract/artifacts/contracts/**/*.json",
            "./node_modules/@perp/curie-liquidity-mining/artifacts/contracts/**/*.json",
        ],
    },
    dependencyCompiler: {
        // We have to compile from source since UniswapV3 doesn't provide artifacts in their npm package
        paths: ["@uniswap/v3-core/contracts/UniswapV3Factory.sol", "@uniswap/v3-core/contracts/UniswapV3Pool.sol"],
    },
    external: {
        contracts: [
            {
                artifacts: "node_modules/@openzeppelin/contracts/build",
            },
            {
                artifacts: "node_modules/@perp/perp-oracle-contract/artifacts",
            },
            {
                artifacts: "node_modules/@perp/curie-contract/artifacts",
            },
            {
                artifacts: "node_modules/@perp/curie-liquidity-mining/artifacts",
            },
        ],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    gasReporter: {
        excludeContracts: ["test"],
    },
    mocha: {
        require: ["ts-node/register/files"],
        jobs: 4,
        timeout: 120000,
        color: true,
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    },
}

export default config
