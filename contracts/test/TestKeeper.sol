// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { ILimitOrderBook } from "../interface/ILimitOrderBook.sol";

contract TestKeeper {
    address internal _limitOrderBook;

    //
    // EXTERNAL NON-VIEW
    //

    constructor(address limitOrderBookArg) {
        _limitOrderBook = limitOrderBookArg;
    }

    function fillLimitOrder(
        ILimitOrderBook.LimitOrder memory order,
        bytes memory signature,
        uint80 roundIdWhenTriggered
    ) external {
        ILimitOrderBook(_limitOrderBook).fillLimitOrder(order, signature, roundIdWhenTriggered);
    }
}
