import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
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
    dependencyCompiler: {
        // make ethers.getContractFactory() work with external contracts
        paths: [
            "@uniswap/v3-core/contracts/UniswapV3Factory.sol",
            "@uniswap/v3-core/contracts/UniswapV3Pool.sol",
            "@perp/perp-oracle-contract/contracts/PriceFeedDispatcher.sol",
            "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeed.sol",
            "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeedV2.sol",
            "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeedV3.sol",
            "@perp/perp-oracle-contract/contracts/BandPriceFeed.sol",
            "@perp/curie-contract/contracts/AccountBalance.sol",
            "@perp/curie-contract/contracts/BaseToken.sol",
            "@perp/curie-contract/contracts/ClearingHouse.sol",
            "@perp/curie-contract/contracts/ClearingHouseConfig.sol",
            "@perp/curie-contract/contracts/Exchange.sol",
            "@perp/curie-contract/contracts/InsuranceFund.sol",
            "@perp/curie-contract/contracts/MarketRegistry.sol",
            "@perp/curie-contract/contracts/OrderBook.sol",
            "@perp/curie-contract/contracts/QuoteToken.sol",
            "@perp/curie-contract/contracts/Vault.sol",
            "@perp/curie-contract/contracts/DelegateApproval.sol",
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
        timeout: 1000 * 60 * 5,
    },
}

export default config
