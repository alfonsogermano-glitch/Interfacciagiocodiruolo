import {createRoot} from 'react-dom/client';
import {ArubaOriginalShellParity} from './ArubaOriginalShellParity';
import './original-shell.css';
const user={id:'00000000-0000-4000-8000-000000000002',
 email:'qa@example.invalid',displayName:'GM di prova',role:'standard' as const};
createRoot(document.getElementById('root')!).render(
 <ArubaOriginalShellParity qaUser={user} mapWorkspaceQa/>
);
