import { notFound } from 'next/navigation';
import { z } from 'zod';
import { projects } from './index';
import { AppError } from '../errors';
export async function getProjectPage(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    return await (await projects()).get(id, 'local-user');
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
