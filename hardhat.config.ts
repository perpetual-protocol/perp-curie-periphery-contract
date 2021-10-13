import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@openzeppelin/hardhat-upgrades"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import { HardhatUserConfig, task } from "hardhat/config"

enum ChainId {
    ARBITRUM_ONE_CHAIN_ID = 42161,
    ARBITRUM_RINKEBY_CHAIN_ID = 421611,
    RINKEBY_CHAIN_ID = 4,
}

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
        // arbitrumRinkeby: {
        //     url: ARBITRUM_RINKEBY_WEB3_ENDPOINT,
        //     accounts: {
        //         mnemonic: ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC,
        //     },
        //     chainId: ChainId.ARBITRUM_RINKEBY_CHAIN_ID,
        // },
        // rinkeby: {
        //     url: RINKEBY_WEB3_ENDPOINT,
        //     accounts: {
        //         mnemonic: RINKEBY_DEPLOYER_MNEMONIC,
        //     },
        // },
    },
    namedAccounts: {
        deployer: 0, // 0 means ethers.getSigners[0]
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
}

export default config
