/** Renderer-safe observation only. No authorization material or mutating methods. */
export interface CompletionObservation {
 mode:'assessment-only';liveWritesEnabled:false;reasonCodes:string[];
 journalAvailable:boolean;operationCount:number;unresolvedCount:number;
 rawRowsAvailable:boolean;intermediateTaskCount:number|null;
 recent:Array<{operationId:string;taskNo:string;state:string}>;
}
