// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

interface IMerkleRedeem {
    function claimWeek(
        address _liquidityProvider,
        uint256 _week,
        uint256 _claimedBalance,
        bytes32[] calldata _merkleProof
    ) external;
}
