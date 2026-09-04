// Shape AuthGuard attaches to request.user after verifying the access token.
export interface AuthenticatedUser {
  personId: string;
  roles: string[];
}
