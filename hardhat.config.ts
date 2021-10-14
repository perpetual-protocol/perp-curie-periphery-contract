import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@openzeppelin/hardhat-upgrades"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import { HardhatUserConfig } from "hardhat/config"

enum ChainId {
    ARBITRUM_ONE_CHAIN_ID = 42161,
    ARBITRUM_RINKEBY_CHAIN_ID = 421611,
    RINKEBY_CHAIN_ID = 4,
}

const ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC = process.env.ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC
const ARBITRUM_RINKEBY_WEB3_ENDPOINT = process.env.ARBITRUM_RINKEBY_WEB3_ENDPOINT
const RINKEBY_DEPLOYER_MNEMONIC = process.env.RINKEBY_DEPLOYER_MNEMONIC
const RINKEBY_WEB3_ENDPOINT = process.env.RINKEBY_WEB3_ENDPOINT

const config: HardhatUserConfig = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: { enabled: true, runs: 0 },
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
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5",
        alwaysGenerateOverloads: false,
        // there would be an error "MalformedAbiError: Not a valid ABI" since typechain doesn't recognize xxx.dbg.json,
        // so we must run "npm run clean-dbg" manually to remove those files
        externalArtifacts: ["./node_modules/@perp/lushan/artifacts/contracts/**/*.json"],
    },
    dependencyCompiler: {
        // We have to compile from source since UniswapV3 doesn't provide artifacts in their npm package
        paths: ["@uniswap/v3-core/contracts/UniswapV3Factory.sol", "@uniswap/v3-core/contracts/UniswapV3Pool.sol"],
    },
    external: {
        contracts: [
            {
                // https://github.com/wighawag/hardhat-deploy#access-to-artifacts-non-deployed-contract-code-and-abi
                // ethers.getContractFactory(artifactName) can read artifacts from @perp/lushan
                artifacts: "node_modules/@perp/lushan/artifacts",
            },
        ],
        deployments: {
            arbitrumRinkeby: ["node_modules/@perp/lushan/deployments/arbitrumRinkeby"],
            rinkeby: ["node_modules/@perp/lushan/deployments/rinkeby"],
        },
    },
    namedAccounts: {
        deployer: 0, // 0 means ethers.getSigners[0]
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
}

export default config
