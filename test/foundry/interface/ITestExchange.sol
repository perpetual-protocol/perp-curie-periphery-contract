// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "@perp/curie-contract/contracts/interface/IExchange.sol";

interface ITestExchange is IExchange {
    function initialize(
        address marketRegistryArg,
        address orderBookArg,
        address clearingHouseConfigArg
    ) external;

    function setAccountBalance(address accountBalanceArg) external;

    function setMaxTickCrossedWithinBlock(address baseToken, uint24 maxTickCrossedWithinBlock) external;

    function setClearingHouse(address clearingHouseArg) external;
}
