/** Fail-closed entry for regular pilot builds. The real original two-column
 * panel is included only by the separately tested Notes preview build. */
export function ArubaOriginalSessionNotesBoundary(){
 return <div className="empty" role="status">Pannello Note non attivato su questa build Aruba.</div>;
}
