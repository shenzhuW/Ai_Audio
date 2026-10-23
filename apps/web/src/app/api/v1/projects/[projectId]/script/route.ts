import { NextRequest } from 'next/server';
import { scriptHttp } from '@/server/script/http';
type Context={params:Promise<{projectId:string}>};
export async function GET(r:NextRequest,c:Context){return scriptHttp(r,(await c.params).projectId,'document');}
export async function POST(r:NextRequest,c:Context){return scriptHttp(r,(await c.params).projectId,'start');}
export async function PATCH(r:NextRequest,c:Context){return scriptHttp(r,(await c.params).projectId,'save');}
