import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import "hardhat-gas-reporter"
import { HardhatUserConfig } from "hardhat/config"

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
}

export default config
