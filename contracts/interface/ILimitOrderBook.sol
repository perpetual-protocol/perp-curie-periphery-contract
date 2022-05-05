// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface ILimitOrderBook {
    // Do NOT change the order of enum values because it will break backwards compatibility
    enum OrderStatus {
        Unfilled,
        Filled,
        Cancelled
    }

    /// @param salt An unique number for creating orders with the same parameters
    /// @param trader The address of trader who creates the order (must be signer)
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param isBaseToQuote B2Q (short) if true, otherwise Q2B (long)
    /// @param isExactInput Exact input if true, otherwise exact output
    /// @param amount The input amount if isExactInput is true, otherwise the output amount
    /// @param oppositeAmountBound
    // B2Q + exact input, want more output quote as possible, so we set a lower bound of output quote
    // B2Q + exact output, want less input base as possible, so we set a upper bound of input base
    // Q2B + exact input, want more output base as possible, so we set a lower bound of output base
    // Q2B + exact output, want less input quote as possible, so we set a upper bound of input quote
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

    /// @notice Emitted when clearingHouse is changed
    /// @param clearingHouseArg The new address of clearingHouse
    event ClearingHouseChanged(address indexed clearingHouseArg);

    /// @notice Emitted when limitOrderFeeVault is changed
    /// @param limitOrderFeeVaultArg The new address of limitOrderFeeVault
    event LimitOrderFeeVaultChanged(address indexed limitOrderFeeVaultArg);

    /// @notice Emitted when the limit order is filled
    /// @param trader The address of trader who created the limit order
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param orderHash The hash of the filled limit order
    /// @param keeper The address of keeper
    /// @param keeperFee The fee reward to keeper
    event LimitOrderFilled(
        address indexed trader,
        address indexed baseToken,
        bytes32 orderHash,
        address keeper,
        uint256 keeperFee
    );

    /// @notice Emitted when the limit order is cancelled
    /// @param trader The address of trader who cancelled the limit order
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param orderHash The hash of the filled limit order
    event LimitOrderCancelled(address indexed trader, address indexed baseToken, bytes32 orderHash);

    /// @param order LimitOrder struct
    /// @param signature The EIP-712 signature of `order` generated from `eth_signTypedData_V4`
    function fillLimitOrder(LimitOrder memory order, bytes memory signature) external;

    /// @param order LimitOrder struct
    function cancelLimitOrder(LimitOrder memory order) external;
}
