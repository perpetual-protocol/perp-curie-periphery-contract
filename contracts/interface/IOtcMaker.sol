// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";

import { IOtcMakerEvent } from "./IOtcMakerEvent.sol";
import { IOtcMakerStruct } from "./IOtcMakerStruct.sol";
import { ILimitOrderBook } from "./ILimitOrderBook.sol";

interface IOtcMaker is IOtcMakerStruct, IOtcMakerEvent {
    //
    // EXTERNAL NON-VIEW
    //

    /// @notice Opens a position for trader by the given limit order,
    ///         using the specified JIT liquidity parameters and signature.
    /// @dev This function can only be called by the designated caller.
    /// @param limitOrderParams The parameters of the limit order.
    /// @param jitLiquidityParams The JIT liquidity parameters.
    /// @param signature The signature associated with the limit order.
    /// @return exchangedPositionSize The exchanged position size of OTCMaker.
    /// @return exchangedPositionNotional The exchanged position notional of OTCMaker.
    function openPositionFor(
        ILimitOrderBook.LimitOrder calldata limitOrderParams,
        JitLiquidityParams calldata jitLiquidityParams,
        bytes calldata signature
    ) external returns (int256 exchangedPositionSize, int256 exchangedPositionNotional);

    /// @notice Opens a position in the clearing house using the provided parameters.
    /// @dev This function can only be called by the designated position manager.
    /// @dev Delegates the call to the clearing house to open the position.
    /// @param params The parameters for opening the position.
    /// @return base The amount of baseToken the taker got or spent
    /// @return quote The amount of quoteToken the taker got or spent
    function openPosition(IClearingHouse.OpenPositionParams calldata params)
        external
        returns (uint256 base, uint256 quote);

    /// @notice Deposits a specified amount of tokens into the vault.
    /// @dev This function can only be called by the designated fund owner.
    /// @param token The address of the token to deposit.
    /// @param amount The amount of tokens to deposit.
    function deposit(address token, uint256 amount) external;

    /// @notice Withdraws a specified amount of tokens from the vault and transfers them to the fund owner.
    /// @dev This function can only be called by the designated fund owner.
    /// @dev Delegates the call to the vault to withdraw the tokens and transfers them to the fund owner.
    /// @param token The address of the token to withdraw.
    /// @param amount The amount of tokens to withdraw.
    function withdraw(address token, uint256 amount) external;

    /// @notice Withdraws the entire balance of a specific token from the contract and transfers it to the fund owner.
    /// @dev This function can only be called by the designated fund owner.
    /// @dev Retrieves the balance of the specified token and transfers the full amount to the fund owner.
    /// @param token The address of the token to withdraw.
    function withdrawToken(address token) external;

    /// @notice Claims a specific week of rewards for a liquidity provider using Merkle proofs.
    /// @dev This function can only be called by the designated fund owner.
    /// @dev Delegates the call to the MerkleRedeem contract to claim rewards for the liquidity provider.
    /// @param merkleRedeem The address of the MerkleRedeem contract.
    /// @param liquidityProvider The address of the liquidity provider.
    /// @param week The week number to claim rewards for.
    /// @param claimedBalance The claimed amount.
    /// @param _merkleProof The Merkle proofs for the verification.
    function claimWeek(
        address merkleRedeem,
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata _merkleProof
    ) external;

    //
    // EXTERNAL VIEW
    //

    function getCaller() external view returns (address);

    function getFundOwner() external view returns (address);

    function getPositionManager() external view returns (address);

    function getClearingHouse() external view returns (address);

    function getLimitOrderBook() external view returns (address);

    function getMarginRatioLimit() external view returns (uint24);

    //
    // PUBLIC VIEW
    //

    function isMarginSufficient() external view returns (bool);
}
