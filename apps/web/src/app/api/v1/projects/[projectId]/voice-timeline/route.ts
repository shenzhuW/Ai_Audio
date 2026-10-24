import {NextRequest} from 'next/server';
import {voiceHttp} from '@/server/voice/http';
async function handle(r:NextRequest,c:{params:Promise<{projectId:string}>}){const p=await c.params;return voiceHttp(r,p.projectId,'timeline');}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
