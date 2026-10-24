import {NextRequest} from 'next/server';
import {voiceHttp} from '@/server/voice/http';
async function handle(r:NextRequest,c:{params:Promise<{projectId:string}>}){const p=await c.params;return voiceHttp(r,p.projectId,'mode');}
export const POST=handle;
