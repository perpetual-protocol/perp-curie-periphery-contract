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
import { HardhatUserConfig } from "hardhat/config"

dotenv.config()

enum ChainId {
    ARBITRUM_ONE_CHAIN_ID = 42161,
    ARBITRUM_RINKEBY_CHAIN_ID = 421611,
    RINKEBY_CHAIN_ID = 4,
    OPTIMISM_KOVAN_CHAIN_ID = 69,
    OPTIMISM_CHAIN_ID = 10,
}

const ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC = process.env.ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC || ""
const ARBITRUM_RINKEBY_WEB3_ENDPOINT = process.env.ARBITRUM_RINKEBY_WEB3_ENDPOINT || ""
const RINKEBY_DEPLOYER_MNEMONIC = process.env.RINKEBY_DEPLOYER_MNEMONIC || ""
const RINKEBY_WEB3_ENDPOINT = process.env.RINKEBY_WEB3_ENDPOINT || ""
const OPTIMISM_KOVAN_DEPLOYER_MNEMONIC = process.env.OPTIMISM_KOVAN_DEPLOYER_MNEMONIC || ""
const OPTIMISM_KOVAN_WEB3_ENDPOINT = process.env.OPTIMISM_KOVAN_WEB3_ENDPOINT || ""
const OPTIMISM_DEPLOYER_MNEMONIC = process.env.OPTIMISM_DEPLOYER_MNEMONIC || ""
const OPTIMISM_WEB3_ENDPOINT = process.env.OPTIMISM_WEB3_ENDPOINT || ""
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ""

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
        },
        arbitrumRinkeby: {
            url: ARBITRUM_RINKEBY_WEB3_ENDPOINT,
            accounts: {
                mnemonic: ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC,
            },
            chainId: ChainId.ARBITRUM_RINKEBY_CHAIN_ID,
        },
        rinkeby: {
            url: RINKEBY_WEB3_ENDPOINT,
            accounts: {
                mnemonic: RINKEBY_DEPLOYER_MNEMONIC,
            },
        },
        optimismKovan: {
            url: OPTIMISM_KOVAN_WEB3_ENDPOINT,
            accounts: {
                mnemonic: OPTIMISM_KOVAN_DEPLOYER_MNEMONIC,
            },
            chainId: ChainId.OPTIMISM_KOVAN_CHAIN_ID,
        },
        optimism: {
            url: OPTIMISM_WEB3_ENDPOINT,
            accounts: {
                mnemonic: OPTIMISM_DEPLOYER_MNEMONIC,
            },
            chainId: ChainId.OPTIMISM_CHAIN_ID,
        },
    },
    namedAccounts: {
        deployer: 0, // 0 means ethers.getSigners[0]
        gnosisSafeAddress: {
            // It's EOA for now to test easier.
            [ChainId.OPTIMISM_KOVAN_CHAIN_ID]: "0x374152052700eDf29Fc2D4ed5eF93cA7d3fdF38e",
        },
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
        alwaysGenerateOverloads: false,
        // there would be an error "MalformedAbiError: Not a valid ABI" since typechain doesn't recognize xxx.dbg.json,
        // so we must run "npm run clean-dbg" manually to remove those files
        externalArtifacts: ["./node_modules/@perp/curie-contract/artifacts/contracts/**/*.json"],
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
    tenderly: {
        project: "curie-periphery-1-x-staging",
        username: "perpprotocol",
    },
}

export default config
