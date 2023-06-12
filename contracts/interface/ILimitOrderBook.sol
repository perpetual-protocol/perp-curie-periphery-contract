// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface ILimitOrderBook {
    // Do NOT change the order of enum values because it will break backwards compatibility
    enum OrderType {
        LimitOrder,
        StopLossLimitOrder,
        TakeProfitLimitOrder,
        OtcMakerOrder
    }

    // Do NOT change the order of enum values because it will break backwards compatibility
    enum OrderStatus {
        Unfilled,
        Filled,
        Cancelled
    }

    /// @param orderType The enum of order type (LimitOrder, StopLossLimitOrder, ...)
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
    /// @param sqrtPriceLimitX96 tx will fill until it reaches this price but WON'T REVERT
    /// @param referralCode The referral code
    /// @param reduceOnly The order will only reduce/close positions if true
    /// @param roundIdWhenCreated Chainlink `roundId` when the limit order is created
    // Only available if orderType is StopLossLimitOrder/TakeProfitLimitOrder, otherwise set to 0
    /// @param triggerPrice The trigger price of the limit order
    // Only available if orderType is StopLossLimitOrder/TakeProfitLimitOrder, otherwise set to 0
    struct LimitOrder {
        OrderType orderType;
        uint256 salt;
        address trader;
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
        uint160 sqrtPriceLimitX96;
        bytes32 referralCode;
        bool reduceOnly;
        uint80 roundIdWhenCreated;
        uint256 triggerPrice;
    }

    /// @notice Emitted when clearingHouse is changed
    /// @param clearingHouseArg The new address of clearingHouse
    event ClearingHouseChanged(address indexed clearingHouseArg);

    /// @notice Emitted when limitOrderRewardVault is changed
    /// @param limitOrderRewardVaultArg The new address of limitOrderRewardVault
    event LimitOrderRewardVaultChanged(address indexed limitOrderRewardVaultArg);

    /// @notice Emitted when minOrderValue is changed
    /// @param minOrderValueArg The minimum limit order value in USD
    event MinOrderValueChanged(uint256 minOrderValueArg);

    /// @notice Emitted when the limit order is filled
    /// @param trader The address of trader who created the limit order
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param orderHash The hash of the filled limit order
    /// @param orderType The enum of order type (LimitOrder, StopLossLimitOrder, ...)
    /// @param keeper The address of keeper
    /// @param exchangedPositionSize The exchanged position size
    /// @param exchangedPositionNotional The exchanged position notional
    /// @param fee The trading fee
    event LimitOrderFilled(
        address indexed trader,
        address indexed baseToken,
        bytes32 orderHash,
        uint8 orderType,
        address keeper,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 fee
    );

    /// @notice Emitted when the limit order is cancelled
    /// @param trader The address of trader who cancelled the limit order
    /// @param baseToken The address of baseToken (vETH, vBTC, ...)
    /// @param orderHash The hash of the cancelled limit order
    /// @param orderType The enum of order type (LimitOrder, StopLossLimitOrder, ...)
    /// @param positionSize The position size
    /// @param positionNotional The position notional
    event LimitOrderCancelled(
        address indexed trader,
        address indexed baseToken,
        bytes32 orderHash,
        uint8 orderType,
        int256 positionSize,
        int256 positionNotional
    );

    /// @param order LimitOrder struct
    /// @param signature The EIP-712 signature of `order` generated from `eth_signTypedData_V4`
    /// @param roundIdWhenTriggered Chainlink `roundId` when triggerPrice is satisfied
    // Only available if orderType is StopLossLimitOrder/TakeProfitLimitOrder, otherwise set to 0
    function fillLimitOrder(
        LimitOrder memory order,
        bytes memory signature,
        uint80 roundIdWhenTriggered
    ) external;

    /// @param order LimitOrder struct
    function cancelLimitOrder(LimitOrder memory order) external;

    function getOrderStatus(bytes32 orderHash) external view returns (ILimitOrderBook.OrderStatus);

    function getOrderHash(LimitOrder memory order) external view returns (bytes32);

    function isWhitelistContractCaller(address caller) external view returns (bool);
}
