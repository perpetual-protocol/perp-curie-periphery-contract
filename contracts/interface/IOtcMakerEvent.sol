// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IOtcMakerEvent {
    event UpdateCaller(address oldCaller, address newCaller);
}
