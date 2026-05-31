export type Role = 'admin' | 'manager' | 'user';

export type JwtUser = {
  sub: string;
  email: string;
  role: Role;
  fullName: string;
};
