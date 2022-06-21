// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";
import { ILimitOrderRewardVault } from "../interface/ILimitOrderRewardVault.sol";
import { LimitOrderBookStorageV1 } from "../storage/LimitOrderBookStorage.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";
import { IBaseToken } from "@perp/curie-contract/contracts/interface/IBaseToken.sol";
import { ChainlinkPriceFeed } from "@perp/perp-oracle-contract/contracts/ChainlinkPriceFeed.sol";

contract LimitOrderBook is
    ILimitOrderBook,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    EIP712Upgradeable,
    LimitOrderBookStorageV1
{
    using AddressUpgradeable for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using PerpSafeCast for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    // NOTE: remember to update typehash if you change LimitOrder struct
    // NOTE: cannot use `OrderType orderType` here, use `uint8 orderType` for enum instead
    // solhint-disable-next-line max-line-length
    // keccak256("LimitOrder(uint8 orderType,uint256 salt,address trader,address baseToken,bool isBaseToQuote,bool isExactInput,uint256 amount,uint256 oppositeAmountBound,uint256 deadline,uint160 sqrtPriceLimitX96,bytes32 referralCode,bool reduceOnly,uint80 roundIdWhenCreated,uint256 triggerPrice)");

    // solhint-disable-next-line func-name-mixedcase
    bytes32 public constant LIMIT_ORDER_TYPEHASH = 0x54ea8c184890b5a7f7321f45a2ae952f0af50e3467b2216418a683566bf57c30;

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        string memory name,
        string memory version,
        address clearingHouseArg,
        address limitOrderRewardVaultArg,
        uint256 minOrderValueArg
    ) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __EIP712_init(name, version); // ex: "PerpCurieLimitOrder" and "1"

        // LOB_CHINC: ClearingHouse Is Not Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        clearingHouse = clearingHouseArg;

        // LOB_ABINC: AccountBalance Is Not Contract
        address accountBalanceArg = IClearingHouse(clearingHouse).getAccountBalance();
        require(accountBalanceArg.isContract(), "LOB_ABINC");
        accountBalance = accountBalanceArg;

        // LOB_LOFVINC: LimitOrderRewardVault Is Not Contract
        require(limitOrderRewardVaultArg.isContract(), "LOB_LOFVINC");
        limitOrderRewardVault = limitOrderRewardVaultArg;

        // LOB_MOVMBGT0: MinOrderValue Must Be Greater Than Zero
        require(minOrderValueArg > 0, "LOB_MOVMBGT0");
        minOrderValue = minOrderValueArg;
    }

    function setClearingHouse(address clearingHouseArg) external onlyOwner {
        // LOB_CHINC: ClearingHouse Is Not Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        clearingHouse = clearingHouseArg;

        // LOB_ABINC: AccountBalance Is Not Contract
        address accountBalanceArg = IClearingHouse(clearingHouse).getAccountBalance();
        require(accountBalanceArg.isContract(), "LOB_ABINC");
        accountBalance = accountBalanceArg;

        emit ClearingHouseChanged(clearingHouseArg);
    }

    function setMinOrderValue(uint256 minOrderValueArg) external onlyOwner {
        // LOB_MOVMBGT0: MinOrderValue Must Be Greater Than Zero
        require(minOrderValueArg > 0, "LOB_MOVMBGT0");
        minOrderValue = minOrderValueArg;

        emit MinOrderValueChanged(minOrderValueArg);
    }

    function setLimitOrderRewardVault(address limitOrderRewardVaultArg) external onlyOwner {
        // LOB_LOFVINC: LimitOrderRewardVault Is Not Contract
        require(limitOrderRewardVaultArg.isContract(), "LOB_LOFVINC");
        limitOrderRewardVault = limitOrderRewardVaultArg;

        emit LimitOrderRewardVaultChanged(limitOrderRewardVaultArg);
    }

    /// @inheritdoc ILimitOrderBook
    function fillLimitOrder(
        LimitOrder memory order,
        bytes memory signature,
        uint80 roundIdWhenTriggered
    ) external override nonReentrant {
        address sender = _msgSender();

        // short term solution: mitigate that attacker can drain LimitOrderRewardVault
        // LOB_SMBE: Sender Must Be EOA
        require(!sender.isContract(), "LOB_SMBE");

        (, bytes32 orderHash) = _verifySigner(order, signature);

        // LOB_OMBU: Order Must Be Unfilled
        require(_ordersStatus[orderHash] == ILimitOrderBook.OrderStatus.Unfilled, "LOB_OMBU");

        (int256 exchangedPositionSize, int256 exchangedPositionNotional, uint256 fee) = _fillLimitOrder(
            order,
            roundIdWhenTriggered
        );

        _ordersStatus[orderHash] = ILimitOrderBook.OrderStatus.Filled;

        ILimitOrderRewardVault(limitOrderRewardVault).disburse(sender, orderHash);

        emit LimitOrderFilled(
            order.trader,
            order.baseToken,
            orderHash,
            uint8(order.orderType),
            sender, // keeper
            exchangedPositionSize,
            exchangedPositionNotional,
            fee
        );
    }

    /// @inheritdoc ILimitOrderBook
    function cancelLimitOrder(LimitOrder memory order) external override {
        // LOB_OSMBS: Order's Signer Must Be Sender
        require(_msgSender() == order.trader, "LOB_OSMBS");

        // we didn't require `signature` as input like fillLimitOrder(),
        // so trader can actually cancel an order that is not existed
        bytes32 orderHash = getOrderHash(order);

        // LOB_OMBU: Order Must Be Unfilled
        require(_ordersStatus[orderHash] == ILimitOrderBook.OrderStatus.Unfilled, "LOB_OMBU");

        _ordersStatus[orderHash] = ILimitOrderBook.OrderStatus.Cancelled;

        int256 positionSize;
        int256 positionNotional;
        if (order.isBaseToQuote) {
            if (order.isExactInput) {
                positionSize = order.amount.neg256();
                positionNotional = order.oppositeAmountBound.toInt256();
            } else {
                positionSize = order.oppositeAmountBound.neg256();
                positionNotional = order.amount.toInt256();
            }
        } else {
            if (order.isExactInput) {
                positionSize = order.oppositeAmountBound.toInt256();
                positionNotional = order.amount.neg256();
            } else {
                positionSize = order.amount.toInt256();
                positionNotional = order.oppositeAmountBound.neg256();
            }
        }

        emit LimitOrderCancelled(
            order.trader,
            order.baseToken,
            orderHash,
            uint8(order.orderType),
            positionSize,
            positionNotional
        );
    }

    //
    // PUBLIC VIEW
    //

    function getOrderHash(LimitOrder memory order) public view override returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_TYPEHASH, order)));
    }

    function getOrderStatus(bytes32 orderHash) external view override returns (ILimitOrderBook.OrderStatus) {
        return _ordersStatus[orderHash];
    }

    //
    // INTERNAL NON-VIEW
    //

    function _fillLimitOrder(LimitOrder memory order, uint80 roundIdWhenTriggered)
        internal
        returns (
            int256,
            int256,
            uint256
        )
    {
        _verifyTriggerPrice(order, roundIdWhenTriggered);

        int256 oldTakerPositionSize = IAccountBalance(accountBalance).getTakerPositionSize(
            order.trader,
            order.baseToken
        );

        (uint256 base, uint256 quote, uint256 fee) = IClearingHouse(clearingHouse).openPositionFor(
            order.trader,
            IClearingHouse.OpenPositionParams({
                baseToken: order.baseToken,
                isBaseToQuote: order.isBaseToQuote,
                isExactInput: order.isExactInput,
                amount: order.amount,
                oppositeAmountBound: order.oppositeAmountBound,
                deadline: order.deadline,
                sqrtPriceLimitX96: order.sqrtPriceLimitX96,
                referralCode: order.referralCode
            })
        );

        // LOB_OVTS: Order Value Too Small
        require(quote >= minOrderValue, "LOB_OVTS");

        if (order.reduceOnly) {
            // LOB_ROINS: ReduceOnly Is Not Satisfied
            require(
                oldTakerPositionSize != 0 &&
                    oldTakerPositionSize < 0 != order.isBaseToQuote &&
                    base <= oldTakerPositionSize.abs(),
                "LOB_ROINS"
            );

            // if trader has no position, order will get reverted
            // if trader has short position, trader can only open a long position
            // => oldTakerPositionSize < 0 != order.isBaseToQuote => true != false
            // if trader has long position, trader can only open a short position
            // => oldTakerPositionSize < 0 != order.isBaseToQuote => false != true
        }

        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        if (order.isBaseToQuote) {
            exchangedPositionSize = base.neg256();
            exchangedPositionNotional = quote.toInt256().add(fee.toInt256());
        } else {
            exchangedPositionSize = base.toInt256();
            exchangedPositionNotional = quote.neg256().add(fee.toInt256());
        }

        return (exchangedPositionSize, exchangedPositionNotional, fee);
    }

    //
    // INTERNAL VIEW
    //

    function _verifySigner(LimitOrder memory order, bytes memory signature) internal view returns (address, bytes32) {
        bytes32 orderHash = getOrderHash(order);
        address signer = ECDSAUpgradeable.recover(orderHash, signature);

        // LOB_SINT: Signer Is Not Trader
        require(signer == order.trader, "LOB_SINT");

        return (signer, orderHash);
    }

    function _verifyTriggerPrice(LimitOrder memory order, uint80 roundIdWhenTriggered) internal view {
        if (order.orderType == ILimitOrderBook.OrderType.LimitOrder) {
            return;
        }

        // NOTE: Chainlink proxy's roundId is always increased
        // https://docs.chain.link/docs/historical-price-data/

        // LOB_IRI: Invalid RoundId
        require(order.roundIdWhenCreated > 0 && roundIdWhenTriggered >= order.roundIdWhenCreated, "LOB_IRI");

        // LOB_ITP: Invalid Trigger Price
        require(order.triggerPrice > 0, "LOB_ITP");

        // NOTE: we can only support stop/take-profit limit order for markets that use ChainlinkPriceFeed
        uint256 triggeredPrice = _getPriceByRoundId(order.baseToken, roundIdWhenTriggered);

        // we need to make sure the price has reached trigger price.
        // however, we can only know whether index price has reached trigger price,
        // we didn't know whether market price has reached trigger price

        // rules of advanced order types
        // https://help.ftx.com/hc/en-us/articles/360031896592-Advanced-Order-Types
        if (order.orderType == ILimitOrderBook.OrderType.StopLossLimitOrder) {
            if (order.isBaseToQuote) {
                // LOB_SSLOTPNM: Sell Stop Limit Order Trigger Price Not Matched
                require(triggeredPrice <= order.triggerPrice, "LOB_SSLOTPNM");
            } else {
                // LOB_BSLOTPNM: Buy Stop Limit Order Trigger Price Not Matched
                require(triggeredPrice >= order.triggerPrice, "LOB_BSLOTPNM");
            }
        } else if (order.orderType == ILimitOrderBook.OrderType.TakeProfitLimitOrder) {
            if (order.isBaseToQuote) {
                // LOB_STLOTPNM: Sell Take-profit Limit Order Trigger Price Not Matched
                require(triggeredPrice >= order.triggerPrice, "LOB_STLOTPNM");
            } else {
                // LOB_BTLOTPNM: Buy Take-profit Limit Order Trigger Price Not Matched
                require(triggeredPrice <= order.triggerPrice, "LOB_BTLOTPNM");
            }
        }
    }

    function _getPriceByRoundId(address baseToken, uint80 roundId) internal view returns (uint256) {
        ChainlinkPriceFeed chainlinkPriceFeed = ChainlinkPriceFeed(IBaseToken(baseToken).getPriceFeed());
        (uint256 price, ) = chainlinkPriceFeed.getRoundData(roundId);
        return _formatDecimals(price, chainlinkPriceFeed.decimals(), 18);
    }

    function _formatDecimals(
        uint256 price,
        uint8 fromDecimals,
        uint8 toDecimals
    ) internal pure returns (uint256) {
        // LOB_ID: Invalid Decimals
        require(fromDecimals <= toDecimals, "LOB_ID");

        return price.mul(10**(toDecimals.sub(fromDecimals)));
    }
}
