// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ILimitOrderBook {
    /// @param salt An unique number for creating orders with the same parameters
    /// @param trader The address of trader who creates the order (must be signer)
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param isBaseToQuote B2Q (short) if true, otherwise Q2B (long)
    /// @param isExactInput
    /// @param amount
    /// @param oppositeAmountBound
    /// @param deadline The block timestamp that the order will expire at (in seconds)
    /// @param reduceOnly The order will only reduce/close positions if true
    struct LimitOrder {
        uint256 salt;
        address trader;
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
        bool reduceOnly;
    }

    event OrderFilled(
        address indexed trader,
        address indexed baseToken,
        bytes32 orderHash,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        int256 remaining,
        address keeper,
        uint256 keeperFee
    );

    event OrderCanceled(address indexed trader, address indexed baseToken, bytes32 orderHash);
}
