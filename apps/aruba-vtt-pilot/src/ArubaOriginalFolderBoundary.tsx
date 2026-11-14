import {useFolderSection} from '../../../src/app/components/shared/useFolderSection';
import type {UseFolderSectionParams} from '../../../src/app/components/shared/useFolderSection';

/**
 * Original folder UI hook unchanged. Aruba has no bearer token; this
 * non-secret sentinel is ONLY for the hook's historical "session ready"
 * boolean checks. The transport ignores it and uses the same-origin cookie.
 * Neither the hook nor the adapter may activate until the server capabilities
 * and authenticated user are confirmed.
 */
export function useArubaOriginalFolderSection<
 T extends {id:string;folderId?:string|null}
>(
 props:Omit<UseFolderSectionParams<T>,'accessToken'> & {sessionReady:boolean},
){
 const {sessionReady,...rest}=props;
 return useFolderSection<T>({
  ...rest,enabled:rest.enabled&&sessionReady,
  accessToken:sessionReady?'aruba-cookie-session':null,
 });
}
