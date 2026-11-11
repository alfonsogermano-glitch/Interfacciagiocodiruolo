/**
 * One answer is valid per local offer. In "stable" the first answer has
 * already been applied. Applying it again throws InvalidStateError.
 * Pure decision helper, independently testable without browser globals.
 */
export function assessAnswer(signalingState, appliedSdp, incomingSdp) {
 if (signalingState === 'have-local-offer' && !appliedSdp) return 'apply';
 if (signalingState === 'stable' && appliedSdp === incomingSdp) return 'duplicate';
 return 'stale';
}
