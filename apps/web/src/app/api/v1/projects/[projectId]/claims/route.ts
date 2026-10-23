import {NextRequest} from 'next/server';
import {researchHttp} from '@/server/research/http';
type Context={params:Promise<{projectId:string}>};
async function handle(r:NextRequest,c:Context){const p=await c.params;return researchHttp(r,p.projectId,'claims');}
export {handle as GET,handle as POST};
