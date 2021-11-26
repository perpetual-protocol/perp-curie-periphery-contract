// SPDX-License-Identifier: GPL-2.0-or-later
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
import { IIndexPrice } from "@perp/curie-contract/contracts/interface/IIndexPrice.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";

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
    // accountValue - positionSizeOfTokenX * (indexPrice - liqPrice) =
    //      totalPositionValue * mmRatio - positionSizeOfTokenX * (indexPrice - liqPrice) * mmRatio
    // liqPrice = indexPrice - ((accountValue - totalPositionValue * mmRatio) /  ((1 - mmRatio) * positionSizeOfTokenX))
    // short:
    // accountValue - positionSizeOfTokenX * (indexPrice - liqPrice) =
    //      totalPositionValue * mmRatio + positionSizeOfTokenX * (indexPrice - liqPrice) * mmRatio
    // liqPrice = indexPrice - ((accountValue - totalPositionValue * mmRatio) /  ((1 + mmRatio) * positionSizeOfTokenX))
    function getLiquidationPrice(address trader, address baseToken) external view returns (uint256) {
        int256 accountValue = IClearingHouse(_clearingHouse).getAccountValue(trader);
        int256 positionSize = IAccountBalance(_accountBalance).getTotalPositionSize(trader, baseToken);

        if (positionSize == 0) return 0;

        uint256 indexPrice =
            IIndexPrice(baseToken).getIndexPrice(IClearingHouseConfig(_clearingHouseConfig).getTwapInterval());
        uint256 totalPositionValue = IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);
        uint24 mmRatio = IClearingHouseConfig(_clearingHouseConfig).getMmRatio();

        int256 magic = positionSize > 0 ? uint256(1e6 - mmRatio).toInt256() : uint256(1e6 + mmRatio).toInt256();
        int256 liquidationPrice =
            indexPrice.toInt256().sub(
                accountValue.sub(totalPositionValue.mulRatio(mmRatio).toInt256()).mul(1e18).div(
                    PerpMath.mulDiv(positionSize, magic, 1e6)
                )
            );

        return liquidationPrice >= 0 ? liquidationPrice.toUint256() : 0;
    }
}
