import {NextRequest} from 'next/server';
import {sourceHttp} from '@/server/research/http';
export async function GET(r:NextRequest,c:{params:Promise<{sourceId:string}>}){return sourceHttp(r,(await c.params).sourceId);}
