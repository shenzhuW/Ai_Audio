import {NextRequest} from 'next/server';
import {researchFile} from '@/server/research/http';
export async function GET(r:NextRequest,c:{params:Promise<{sourceId:string;blobId:string}>}){const p=await c.params;return researchFile(r,p.sourceId,p.blobId);}
export const HEAD=GET;
