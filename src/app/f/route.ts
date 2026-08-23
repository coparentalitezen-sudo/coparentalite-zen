import { destinationLienCourt } from '@/lib/marketing/liens-courts';

export function GET(request: Request): Response {
  return Response.redirect(destinationLienCourt(request.url, 'facebook'), 307);
}
