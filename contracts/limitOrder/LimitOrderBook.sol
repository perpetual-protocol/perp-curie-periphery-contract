// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "../base/BlockContext.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { PerpSafeCast } from "@perp/curie-contract/contracts/lib/PerpSafeCast.sol";
import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";
import { ILimitOrderRewardVault } from "../interface/ILimitOrderRewardVault.sol";
import { LimitOrderBookStorageV1 } from "../storage/LimitOrderBookStorage.sol";
import { OwnerPausable } from "../base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { IClearingHouse } from "@perp/curie-contract/contracts/interface/IClearingHouse.sol";
import { IAccountBalance } from "@perp/curie-contract/contracts/interface/IAccountBalance.sol";

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

    // NOTE: cannot use `OrderType orderType` here, use `uint8 orderType` instead
    // solhint-disable-next-line func-name-mixedcase
    bytes32 public constant LIMIT_ORDER_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LimitOrder(uint8 orderType,uint256 salt,address trader,address baseToken,bool isBaseToQuote,bool isExactInput,uint256 amount,uint256 oppositeAmountBound,uint256 deadline,uint160 sqrtPriceLimitX96,bytes32 referralCode,bool reduceOnly,uint80 roundIdWhenCreated,uint256 triggerPrice)"
        );

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        string memory name,
        string memory version,
        address clearingHouseArg,
        address limitOrderRewardVaultArg
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
        // TODO: support StopLimitOrder in the future
        // LOB_OSLO: Only Support LimitOrder
        require(order.orderType == ILimitOrderBook.OrderType.LimitOrder, "LOB_OSLO");

        bytes32 orderHash = getOrderHash(order);
        verifySigner(order, signature);

        // LOB_OMBU: Order Must Be Unfilled
        require(_ordersStatus[orderHash] == ILimitOrderBook.OrderStatus.Unfilled, "LOB_OMBU");

        int256 oldTakerPositionSize = IAccountBalance(accountBalance).getTakerPositionSize(
            order.trader,
            order.baseToken
        );

        if (order.reduceOnly) {
            // LOB_ROINS: ReduceOnly Is Not Satisfied
            require((oldTakerPositionSize != 0) && (oldTakerPositionSize < 0 != order.isBaseToQuote), "LOB_ROINS");
            // if trader has no position, he/she will get reverted
            // if trader has short position, he/she can only open a long position
            // => oldTakerPositionSize < 0 != order.isBaseToQuote => true != false
            // if trader has long position, he/she can only open a short position
            // => oldTakerPositionSize < 0 != order.isBaseToQuote => false != true
        }

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

        if (order.reduceOnly) {
            // LOB_RSCBGTOS: Reduced Size Cannot Be Greater Than Old Size
            require(base <= oldTakerPositionSize.abs(), "LOB_RSCBGTOS");
        }

        _ordersStatus[orderHash] = ILimitOrderBook.OrderStatus.Filled;

        address keeper = _msgSender();
        uint256 keeperReward = ILimitOrderRewardVault(limitOrderRewardVault).disburse(keeper);

        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        if (order.isBaseToQuote) {
            exchangedPositionSize = base.neg256();
            exchangedPositionNotional = quote.toInt256().add(fee.toInt256());
        } else {
            exchangedPositionSize = base.toInt256();
            exchangedPositionNotional = quote.neg256().add(fee.toInt256());
        }

        emit LimitOrderFilled(
            order.trader,
            order.baseToken,
            orderHash,
            keeper,
            keeperReward,
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

        emit LimitOrderCancelled(order.trader, order.baseToken, orderHash, positionSize, positionNotional);
    }

    //
    // PUBLIC VIEW
    //

    function getOrderHash(LimitOrder memory order) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_TYPEHASH, order)));
    }

    function verifySigner(LimitOrder memory order, bytes memory signature) public view returns (address) {
        bytes32 orderHash = getOrderHash(order);
        address signer = ECDSAUpgradeable.recover(orderHash, signature);

        // LOB_SINT: Signer Is Not Trader
        require(signer == order.trader, "LOB_SINT");

        return signer;
    }
}
