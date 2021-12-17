// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import { PerpLiquidityMining } from "@perp/curie-liquidity-mining/contracts/PerpLiquidityMining.sol";

contract TestPerpLiquidityMining is PerpLiquidityMining {
    function verifyClaim(
        address _liquidityProvider,
        uint256 _week,
        uint256 _claimedBalance,
        bytes32[] memory _merkleProof
    ) public view override returns (bool valid) {
        return true;
    }
}
