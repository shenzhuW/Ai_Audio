import {NextRequest} from 'next/server';
import {researchHttp} from '@/server/research/http';
type Context={params:Promise<{projectId:string;sourceId:string}>};
async function handle(r:NextRequest,c:Context){const p=await c.params;return researchHttp(r,p.projectId,'source-settings',p.sourceId);}
export {handle as PATCH};
