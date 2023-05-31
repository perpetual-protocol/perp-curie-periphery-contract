// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IOtcMakerEvent {
    event CallerUpdated(address oldCaller, address newCaller);
    event FundOwnerUpdated(address oldFundOwner, address newFundOwner);
    event PositionManagerUpdated(address oldPositionManager, address newPositionManager);
}
