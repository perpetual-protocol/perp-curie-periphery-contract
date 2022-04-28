// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import "../limitOrder/LimitOrderBook.sol";

contract TestLimitOrderBook is LimitOrderBook {
    uint256 private _testBlockTimestamp;

    //
    // EXTERNAL NON-VIEW
    //

    function setBlockTimestamp(uint256 blockTimestamp) external {
        _testBlockTimestamp = blockTimestamp;
    }

    //
    // EXTERNAL VIEW
    //

    function getBlockTimestamp() external view returns (uint256) {
        return _testBlockTimestamp;
    }

    //
    // INTERNAL VIEW
    //

    function _blockTimestamp() internal view override returns (uint256) {
        return _testBlockTimestamp;
    }
}