// Retry is bounded, cancellation is explicit, and GM approval remains mandatory.
export function retryDelay(attempt) {
 if(!Number.isInteger(attempt)||attempt<1||attempt>6)return null;
 return Math.min(10000,1000*2**(attempt-1));
}
export function canRetry({requested, connected, attempt}) {
 return requested===true && connected!==true && retryDelay(attempt)!==null;
}
