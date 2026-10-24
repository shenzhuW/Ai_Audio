import {NextRequest} from 'next/server';
import {voiceFile} from '@/server/voice/http';
async function handle(r:NextRequest,c:{params:Promise<{projectId:string;blobId:string}>}){const p=await c.params;return voiceFile(r,p.projectId,p.blobId);}
export const GET=handle;
export const HEAD=handle;
