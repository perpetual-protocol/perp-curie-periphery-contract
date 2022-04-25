// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { BlockContext } from "./base/BlockContext.sol";
import { ECDSAUpgradeable } from "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/drafts/EIP712Upgradeable.sol";
import { ILimitOrderBook } from "./interface/ILimitOrderBook.sol";
import { OwnerPausable } from "./base/OwnerPausable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract LimitOrderBook is ILimitOrderBook, BlockContext, ReentrancyGuardUpgradeable, OwnerPausable, EIP712Upgradeable {
    // solhint-disable-next-line func-name-mixedcase
    bytes32 public LIMIT_ORDER_TYPEHASH =
        keccak256(
            // solhint-disable-next-line max-line-length
            "LimitOrder(uint256 salt,address trader,address baseToken,bool isBaseToQuote,bool isExactInput,uint256 amount,uint256 oppositeAmountBound,uint256 deadline,bool reduceOnly)"
        );

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(string memory name, string memory version) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __EIP712_init(name, version); // ex: "PerpCurieLimitOrder" and "1"
    }

    /// @param signature a EIP712 signature, generated from `eth_signTypedData_v4`
    function fillLimitOrder(LimitOrder memory order, bytes memory signature) external {
        bytes32 orderHash = getOrderHash(order);
        address signer = verifySigner(order, signature);

        // TODO
        // requireSignatureIsValid();
        // requireOrderCriteriaIsMatched();
        // ClearingHouse.openPositionOnBehalf(order.trader, openPositionParams);
        // updateOrderStatus();
        // distributeKeeperFee();
        // emit OrderFilled();
    }

    //
    // EXTERNAL VIEW
    //

    function getOrderHash(LimitOrder memory order) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(LIMIT_ORDER_TYPEHASH, order)));
    }

    //
    // INTERNAL VIEW
    //

    function verifySigner(LimitOrder memory order, bytes memory signature) public view returns (address) {
        bytes32 orderHash = getOrderHash(order);
        address signer = ECDSAUpgradeable.recover(orderHash, signature);

        // LOB_SNET: signer is not trader
        require(signer == order.trader, "LOB_SINT");

        return signer;
    }
}
