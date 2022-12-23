// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "@perp/curie-contract/contracts/interface/IClearingHouseConfig.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";
import { IExchange } from "@perp/curie-contract/contracts/interface/IExchange.sol";
import { IOrderBook } from "@perp/curie-contract/contracts/interface/IOrderBook.sol";
import { IMarketRegistry } from "@perp/curie-contract/contracts/interface/IMarketRegistry.sol";
import { IOrderBook } from "@perp/curie-contract/contracts/interface/IOrderBook.sol";
import { IVault } from "@perp/curie-contract/contracts/interface/IVault.sol";
import { IBaseToken } from "@perp/curie-contract/contracts/interface/IBaseToken.sol";
import { AccountMarket } from "@perp/curie-contract/contracts/lib/AccountMarket.sol";
import { OpenOrder } from "@perp/curie-contract/contracts/lib/OpenOrder.sol";
import { Funding } from "@perp/curie-contract/contracts/lib/Funding.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "hardhat/console.sol";

contract PerpPortal {
    using PerpMath for int256;
    using PerpMath for uint256;
    using PerpSafeCast for int256;
    using PerpSafeCast for uint256;
    using SignedSafeMath for int256;

    address internal _clearingHouse;
    address internal _clearingHouseConfig;
    address internal _accountBalance;
    address internal _exchange;
    address internal _orderBook;
    address internal _insuranceFund;
    address internal _marketRegistry;
    address internal _vault;

    constructor(
        address clearingHouseArg,
        address clearingHouseConfigArg,
        address accountBalanceArg,
        address exchangeArg,
        address orderBookArg,
        address insuranceFundArg,
        address marketRegistryArg,
        address vaultArg
    ) {
        _clearingHouse = clearingHouseArg;
        _clearingHouseConfig = clearingHouseConfigArg;
        _accountBalance = accountBalanceArg;
        _exchange = exchangeArg;
        _orderBook = orderBookArg;
        _insuranceFund = insuranceFundArg;
        _marketRegistry = marketRegistryArg;
        _vault = vaultArg;
    }

    // long:
    // accountValue - positionSizeOfTokenX * (markPricePrice - liqPrice) =
    //      totalPositionValue * mmRatio - positionSizeOfTokenX * (markPrice - liqPrice) * mmRatio
    // liqPrice = markPrice - ((accountValue - totalPositionValue * mmRatio) /  ((1 - mmRatio) * positionSizeOfTokenX))
    // short:
    // accountValue - positionSizeOfTokenX * (markPrice - liqPrice) =
    //      totalPositionValue * mmRatio + positionSizeOfTokenX * (markPrice - liqPrice) * mmRatio
    // liqPrice = markPrice - ((accountValue - totalPositionValue * mmRatio) /  ((1 + mmRatio) * positionSizeOfTokenX))
    function getLiquidationPrice(address trader, address baseToken) external view returns (uint256) {
        int256 accountValue = IClearingHouse(_clearingHouse).getAccountValue(trader);
        int256 positionSize = IAccountBalance(_accountBalance).getTotalPositionSize(trader, baseToken);

        if (positionSize == 0) return 0;

        uint256 markPrice = IAccountBalance(_accountBalance).getMarkPrice(baseToken);
        uint256 totalPositionValue = IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);
        uint24 mmRatio = IClearingHouseConfig(_clearingHouseConfig).getMmRatio();
        int256 multiplier = positionSize > 0 ? uint256(1e6 - mmRatio).toInt256() : uint256(1e6 + mmRatio).toInt256();
        int256 remainedAccountValue = accountValue.sub(totalPositionValue.mulRatio(mmRatio).toInt256());
        int256 multipliedPositionSize = PerpMath.mulDiv(positionSize, multiplier, 1e6);
        int256 liquidationPrice = markPrice.toInt256().sub(remainedAccountValue.mul(1e18).div(multipliedPositionSize));

        return liquidationPrice >= 0 ? liquidationPrice.toUint256() : 0;
    }

    // ClearingHouse view functions
    function getAccountValue(address trader) external view returns (int256) {
        return IClearingHouse(_clearingHouse).getAccountValue(trader);
    }

    function getQuoteToken() external view returns (address) {
        return IClearingHouse(_clearingHouse).getQuoteToken();
    }

    function getUniswapV3Factory() external view returns (address) {
        return IClearingHouse(_clearingHouse).getUniswapV3Factory();
    }

    // Exchange view functions
    function getMaxTickCrossedWithinBlock(address baseToken) external view returns (uint24) {
        return IExchange(_exchange).getMaxTickCrossedWithinBlock(baseToken);
    }

    function getAllPendingFundingPayment(address trader) external view returns (int256) {
        return IExchange(_exchange).getAllPendingFundingPayment(trader);
    }

    function getPendingFundingPayment(address trader, address baseToken) external view returns (int256) {
        return IExchange(_exchange).getPendingFundingPayment(trader, baseToken);
    }

    function getSqrtMarkTwapX96(address baseToken, uint32 twapInterval) external view returns (uint160) {
        return IExchange(_exchange).getSqrtMarkTwapX96(baseToken, twapInterval);
    }

    function getPnlToBeRealized(IExchange.RealizePnlParams memory params) external view returns (int256) {
        return IExchange(_exchange).getPnlToBeRealized(params);
    }

    // OrderBook view functions
    function updateOrderDebt(
        bytes32 orderId,
        int256 base,
        int256 quote
    ) external {
        return IOrderBook(_orderBook).updateOrderDebt(orderId, base, quote);
    }

    function getOpenOrderIds(address trader, address baseToken) external view returns (bytes32[] memory) {
        return IOrderBook(_orderBook).getOpenOrderIds(trader, baseToken);
    }

    function getOpenOrderById(bytes32 orderId) external view returns (OpenOrder.Info memory) {
        return IOrderBook(_orderBook).getOpenOrderById(orderId);
    }

    function getOpenOrder(
        address trader,
        address baseToken,
        int24 lowerTick,
        int24 upperTick
    ) external view returns (OpenOrder.Info memory) {
        return IOrderBook(_orderBook).getOpenOrder(trader, baseToken, lowerTick, upperTick);
    }

    function hasOrder(address trader, address[] calldata tokens) external view returns (bool) {
        return IOrderBook(_orderBook).hasOrder(trader, tokens);
    }

    function getTotalQuoteBalanceAndPendingFee(address trader, address[] calldata baseTokens)
        external
        view
        returns (int256 totalQuoteAmountInPools, uint256 totalPendingFee)
    {
        return IOrderBook(_orderBook).getTotalQuoteBalanceAndPendingFee(trader, baseTokens);
    }

    function getTotalTokenAmountInPoolAndPendingFee(
        address trader,
        address baseToken,
        bool fetchBase
    ) external view returns (uint256 tokenAmount, uint256 totalPendingFee) {
        return IOrderBook(_orderBook).getTotalTokenAmountInPoolAndPendingFee(trader, baseToken, fetchBase);
    }

    function getTotalOrderDebt(
        address trader,
        address baseToken,
        bool fetchBase
    ) external view returns (uint256) {
        return IOrderBook(_orderBook).getTotalOrderDebt(trader, baseToken, fetchBase);
    }

    /// @dev this is the view version of updateFundingGrowthAndLiquidityCoefficientInFundingPayment()
    /// @return liquidityCoefficientInFundingPayment the funding payment of all orders/liquidity of a maker
    function getLiquidityCoefficientInFundingPayment(
        address trader,
        address baseToken,
        Funding.Growth memory fundingGrowthGlobal
    ) external view returns (int256 liquidityCoefficientInFundingPayment) {
        return IOrderBook(_orderBook).getLiquidityCoefficientInFundingPayment(trader, baseToken, fundingGrowthGlobal);
    }

    function getPendingFee(
        address trader,
        address baseToken,
        int24 lowerTick,
        int24 upperTick
    ) external view returns (uint256) {
        return IOrderBook(_orderBook).getPendingFee(trader, baseToken, lowerTick, upperTick);
    }

    // MarketRegistry view functions
    function getPool(address baseToken) external view returns (address) {
        return IMarketRegistry(_marketRegistry).getPool(baseToken);
    }

    function getFeeRatio(address baseToken) external view returns (uint24) {
        return IMarketRegistry(_marketRegistry).getFeeRatio(baseToken);
    }

    function getInsuranceFundFeeRatio(address baseToken) external view returns (uint24) {
        return IMarketRegistry(_marketRegistry).getInsuranceFundFeeRatio(baseToken);
    }

    function getMarketInfo(address baseToken) external view returns (IMarketRegistry.MarketInfo memory) {
        return IMarketRegistry(_marketRegistry).getMarketInfo(baseToken);
    }

    function getMaxOrdersPerMarket() external view returns (uint8) {
        return IMarketRegistry(_marketRegistry).getMaxOrdersPerMarket();
    }

    function hasPool(address baseToken) external view returns (bool) {
        return IMarketRegistry(_marketRegistry).hasPool(baseToken);
    }

    // AccountBalance view functions
    function getBaseTokens(address trader) external view returns (address[] memory) {
        return IAccountBalance(_accountBalance).getBaseTokens(trader);
    }

    function getAccountInfo(address trader, address baseToken) external view returns (AccountMarket.Info memory) {
        return IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken);
    }

    function getTakerOpenNotional(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerOpenNotional(trader, baseToken);
    }

    function getTotalOpenNotional(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getTotalOpenNotional(trader, baseToken);
    }

    function getTotalDebtValue(address trader) external view returns (uint256) {
        return IAccountBalance(_accountBalance).getTotalDebtValue(trader);
    }

    function getMarginRequirementForLiquidation(address trader) external view returns (int256) {
        return IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader);
    }

    function getPnlAndPendingFee(address trader)
        external
        view
        returns (
            int256 owedRealizedPnl,
            int256 unrealizedPnl,
            uint256 pendingFee
        )
    {
        return IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);
    }

    function hasOrder(address trader) external view returns (bool) {
        return IAccountBalance(_accountBalance).hasOrder(trader);
    }

    function getBase(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getBase(trader, baseToken);
    }

    function getQuote(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getQuote(trader, baseToken);
    }

    function getTakerPositionSize(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
    }

    function getTotalPositionSize(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getTotalPositionSize(trader, baseToken);
    }

    function getTotalPositionValue(address trader, address baseToken) external view returns (int256) {
        return IAccountBalance(_accountBalance).getTotalPositionValue(trader, baseToken);
    }

    function getTotalAbsPositionValue(address trader) external view returns (uint256) {
        return IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);
    }

    // ClearingHouseConfig view functions
    function getMaxMarketsPerAccount() external view returns (uint8) {
        return IClearingHouseConfig(_clearingHouseConfig).getMaxMarketsPerAccount();
    }

    function getImRatio() external view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getImRatio();
    }

    function getMmRatio() external view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getMmRatio();
    }

    function getLiquidationPenaltyRatio() external view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getLiquidationPenaltyRatio();
    }

    function getPartialCloseRatio() external view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getPartialCloseRatio();
    }

    function getTwapInterval() external view returns (uint32) {
        return IClearingHouseConfig(_clearingHouseConfig).getTwapInterval();
    }

    function getSettlementTokenBalanceCap() external view returns (uint256) {
        return IClearingHouseConfig(_clearingHouseConfig).getSettlementTokenBalanceCap();
    }

    function getMaxFundingRate() external view returns (uint24) {
        return IClearingHouseConfig(_clearingHouseConfig).getMaxFundingRate();
    }

    // Vault view functions
    function getBalance(address account) external view returns (int256) {
        return IVault(_vault).getBalance(account);
    }

    function getFreeCollateral(address trader) external view returns (uint256) {
        return IVault(_vault).getFreeCollateral(trader);
    }

    function getFreeCollateralByRatio(address trader, uint24 ratio) external view returns (int256) {
        return IVault(_vault).getFreeCollateralByRatio(trader, ratio);
    }

    function getSettlementToken() external view returns (address) {
        return IVault(_vault).getSettlementToken();
    }

    function vaultDecimals() external view returns (uint8) {
        return IVault(_vault).decimals();
    }

    function getTotalDebt() external view returns (uint256) {
        return IVault(_vault).getTotalDebt();
    }

    function getAccountLeverage(address trader) external view returns (int256) {
        int256 accountValue = IClearingHouse(_clearingHouse).getAccountValue(trader);
        uint256 totalPositionValue = IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);

        // no collateral & no position
        if (accountValue == 0 && totalPositionValue == 0) {
            return 0;
        }

        // debt >= 0
        if (accountValue <= 0) {
            return -1;
        }

        return totalPositionValue.toInt256().mulDiv(1e18, accountValue.toUint256());
    }

    // perpPortal view functions

    function getClearingHouse() external view returns (address) {
        return _clearingHouse;
    }

    function getClearingHouseConfig() external view returns (address) {
        return _clearingHouseConfig;
    }

    function getAccountBalance() external view returns (address) {
        return _accountBalance;
    }

    function getExchange() external view returns (address) {
        return _exchange;
    }

    function getOrderBook() external view returns (address) {
        return _orderBook;
    }

    function getInsuranceFund() external view returns (address) {
        return _insuranceFund;
    }

    function getMarketRegistry() external view returns (address) {
        return _marketRegistry;
    }

    function getVault() external view returns (address) {
        return _vault;
    }
}
