// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IUniswapV3Pool } from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import { TickMath } from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import { IUniswapV3SwapCallback } from "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { SwapMath } from "@perp/curie-contract/contracts/lib/SwapMath.sol";
import { IMarketRegistry } from "@perp/curie-contract/contracts/interface/IMarketRegistry.sol";

/// @title Provides quotes for swaps
/// @notice Allows getting the expected amount out or amount in for a given swap without executing the swap
/// @dev These functions are not gas efficient and should _not_ be called on chain. Instead, optimistically execute
/// the swap and check the amounts in the callback.
contract Quoter is IUniswapV3SwapCallback {
    using SafeMath for uint256;
    using PerpSafeCast for uint256;
    using SignedSafeMath for int256;
    using PerpMath for int256;
    using Address for address;

    struct SwapParams {
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint160 sqrtPriceLimitX96; // price slippage protection
    }

    struct SwapResponse {
        uint256 deltaAvailableBase;
        uint256 deltaAvailableQuote;
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        uint160 sqrtPriceX96;
    }

    address public marketRegistry;

    constructor(address marketRegistryArg) {
        // Q_ANC: Exchange address is not contract
        require(marketRegistryArg.isContract(), "Q_ANC");
        marketRegistry = marketRegistryArg;
    }

    function swap(SwapParams memory params) external returns (SwapResponse memory response) {
        // Q_ZI: zero input
        require(params.amount > 0, "Q_ZI");

        // getMarketInfo will revert with MR_PNE if pool not exists
        IMarketRegistry.MarketInfo memory marketInfo = IMarketRegistry(marketRegistry).getMarketInfo(params.baseToken);
        address pool = marketInfo.pool;

        uint24 uniswapFeeRatio = marketInfo.uniswapFeeRatio;
        uint24 exchangeFeeRatio = marketInfo.exchangeFeeRatio;
        // scale up before swap to achieve customized fee/ignore Uniswap fee
        (uint256 scaledAmount, ) =
            SwapMath.calcScaledAmountForSwaps(
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                exchangeFeeRatio,
                uniswapFeeRatio
            );
        // UniswapV3Pool uses the sign to determine isExactInput or not
        int256 specifiedAmount = params.isExactInput ? scaledAmount.toInt256() : -scaledAmount.toInt256();

        try
            IUniswapV3Pool(pool).swap(
                address(this),
                params.isBaseToQuote,
                specifiedAmount,
                params.sqrtPriceLimitX96 == 0
                    ? (params.isBaseToQuote ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                    : params.sqrtPriceLimitX96,
                abi.encode(params.baseToken)
            )
        // solhint-disable-next-line no-empty-blocks
        {

        } catch (bytes memory reason) {
            (uint256 base, uint256 quote, uint160 sqrtPriceX96) = _parseRevertReason(reason);

            uint256 fee;
            int256 exchangedPositionSize;
            int256 exchangedPositionNotional;

            if (params.isBaseToQuote) {
                fee = FullMath.mulDivRoundingUp(quote, exchangeFeeRatio, 1e6);
                // short: exchangedPositionSize <= 0 && exchangedPositionNotional >= 0
                exchangedPositionSize = -(SwapMath.calcAmountScaledByFeeRatio(base, uniswapFeeRatio, false).toInt256());
                // due to base to quote fee, exchangedPositionNotional contains the fee
                // s.t. we can take the fee away from exchangedPositionNotional
                exchangedPositionNotional = quote.toInt256();
            } else {
                // check the doc of custom fee for more details
                // let x : uniswapFeeRatio, y : clearingHouseFeeRatio
                // qr * y * (1 - x) / (1 - y)
                fee = SwapMath
                    .calcAmountWithFeeRatioReplaced(
                    quote.mul(exchangeFeeRatio),
                    uniswapFeeRatio,
                    exchangeFeeRatio,
                    false
                )
                    .div(1e6);

                // long: exchangedPositionSize >= 0 && exchangedPositionNotional <= 0
                exchangedPositionSize = base.toInt256();
                exchangedPositionNotional = -(
                    SwapMath.calcAmountScaledByFeeRatio(quote, uniswapFeeRatio, false).toInt256()
                );
            }
            response = SwapResponse(
                exchangedPositionSize.abs(), // deltaAvailableBase
                exchangedPositionNotional.sub(fee.toInt256()).abs(), // deltaAvailableQuote
                exchangedPositionSize,
                exchangedPositionNotional,
                sqrtPriceX96
            );

            // if it's exact output with a price limit, ensure that the full output amount has been receive
            if (!params.isExactInput && params.sqrtPriceLimitX96 == 0) {
                uint256 amountReceived =
                    params.isBaseToQuote ? response.deltaAvailableQuote : response.deltaAvailableBase;
                // Q_UOA: unmatched output amount
                require(amountReceived == params.amount, "Q_UOA");
            }
        }
    }

    /// @inheritdoc IUniswapV3SwapCallback
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes memory data
    ) external view override {
        // swaps entirely within 0-liquidity regions are not supported -> 0 swap is forbidden
        // Q_F0S: forbidden 0 swap
        require(amount0Delta > 0 || amount1Delta > 0, "Q_F0S");

        address baseToken = abi.decode(data, (address));
        address pool = IMarketRegistry(marketRegistry).getPool(baseToken);
        // CH_FSV: failed swapCallback verification
        require(msg.sender == pool, "Q_FSV");

        (uint256 base, uint256 quote) = (amount0Delta.abs(), amount1Delta.abs());
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();

        // solhint-disable-next-line no-inline-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, base)
            mstore(add(ptr, 0x20), quote)
            mstore(add(ptr, 0x40), sqrtPriceX96)
            revert(ptr, 96)
        }
    }

    /// @dev Parses a revert reason that should contain the numeric quote
    function _parseRevertReason(bytes memory reason)
        private
        pure
        returns (
            uint256 base,
            uint256 quote,
            uint160 sqrtPriceX96
        )
    {
        if (reason.length != 96) {
            // Q_UE: unexpected error
            if (reason.length < 68) revert("Q_UE");
            // solhint-disable-next-line no-inline-assembly
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256, uint256, uint160));
    }
}
