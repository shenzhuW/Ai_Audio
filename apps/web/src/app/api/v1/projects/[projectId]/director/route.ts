import {NextRequest} from 'next/server';
import {directorHttp} from '@/server/director/http';
async function handle(r:NextRequest,c:{params:Promise<{projectId:string}>}){const p=await c.params;return directorHttp(r,p.projectId,false);}
export const POST=handle;
export const GET=handle;
export const PATCH=handle;
